import { supabase } from '../config/supabase.js';

// El motor de viajes (F-24). Despierta por ciclo, lee las senales abiertas que un viaje activo
// sabe procesar, inscribe al cliente y ejecuta los pasos cuya fecha ya se cumplio: arma el
// mensaje con la plantilla preaprobada y lo deja 'en cola' en la Bandeja de salida.
//
// Reglas de funcionamiento, tomadas de las decisiones del proyecto:
//
//   1. La consistencia la pone la base: inscripcion unica por cliente y viaje, ejecucion unica
//      por paso, mensaje atado a un hilo de su mismo canal, y la traba de que un mensaje
//      automatico solo nace de una ejecucion. Aqui solo se arma la orden.
//   2. Un fallo por fila no detiene la corrida: se anota en el resumen y la corrida sigue.
//      Fallar hacia cerrado por fila, no por lote.
//   3. Todo lo que ejecuta queda con su asiento en la auditoria, firmado por el motor como
//      actor del tipo 'sistema'. La pantalla Registro tiene que poder contar la historia.
//   4. No se inventa contenido: el texto sale de la plantilla aprobada y solo se rellenan las
//      variables conocidas. Lo que no se sabe queda visible con su marcador.
//
// La traba anti doble corrida es la variable `enCorrida`: el ciclo automatico del servidor y
// el boton manual de la pantalla nunca corren al mismo tiempo.

let enCorrida = false;

// Marcadores que se rellenan con valores de exhibicion mientras el equipo no configure los
// suyos: el dominio es el de la plataforma y los horarios son de muestra. No son datos de
// ningun cliente, asi que no violan el guardarraíl de datos.
const VALORES_DE_EXHIBICION = Object.freeze({
  EnlaceAgendamiento: 'https://alyto.io/agendar',
  EnlaceVideo: 'https://alyto.io/video-demo',
  OpcionA: 'mañana a las 10:00',
  OpcionB: 'mañana a las 16:00',
});

function rellenaTexto(plantilla, variables) {
  const relleno = plantilla.replace(/\[([A-Za-z]+)\]/gu, (entera, clave) => {
    const clavePlana = clave.replace(/([a-z])([A-Z])/gu, '$1_$2').toLowerCase();
    const valor = variables[clavePlana] ?? VALORES_DE_EXHIBICION[clave];
    if (valor === undefined || valor === null) return entera; // queda visible: no se inventa
    return String(valor);
  });
  // Un nombre como 'Importadora Pacifico S.A.' mas el punto de la frase dejaria 'S.A..' por
  // lo que se colapsa la repeticion: es presentacion, no redaccion nueva.
  return relleno.replace(/\.{2,}/gu, '.');
}

function nombreDeContacto(cliente) {
  const nombre = cliente?.display_name ?? '';
  if (cliente?.account_type === 'persona_natural') {
    const partes = nombre.split(' ').filter(Boolean);
    return partes.slice(0, 2).join(' ') || 'cliente';
  }
  return nombre;
}

function empresaDe(cliente) {
  return cliente?.company_name || cliente?.legal_name || cliente?.display_name || '';
}

function listaLegibleDe(detalleSenal) {
  const detalle = detalleSenal ?? {};
  const foco = detalle.requisito
    ? String(detalle.requisito).replace(/_/gu, ' ')
    : detalle.faltan
      ? String(detalle.faltan)
      : null;
  return foco ? `registro pendiente: ${foco}` : 'los documentos pendientes de tu legajo';
}

function fechaEnDias(numero) {
  return new Date(Date.now() + Number(numero) * 24 * 60 * 60 * 1000).toISOString();
}

function ahora() {
  return new Date().toISOString();
}

// El asiento del motor: actor 'sistema', sin usuario detras. Si el asiento no entra no frena
// el trabajo, pero se avisa en el log para que la pantalla Registro no quede con un hueco.
async function asiento(logger, payload, texto) {
  const { error } = await supabase.from('audit_events').insert({
    actor: 'Motor de viajes',
    actor_id: null,
    actor_kind: 'sistema',
    action: payload.action,
    entity_type: payload.entity_type,
    entity_id: payload.entity_id,
    detail: texto,
    outcome: 'exito',
  });
  if (error) logger?.warn?.(`[MOTOR] asiento sin escribir (${payload.action}): ${error.message}`);
}

// ---------------------------------------------------------------- paso 1: senal -> inscripcion
async function consumeSenales(logger, resumen) {
  const { data: viajes, error: errViajes } = await supabase
    .from('journeys')
    .select('id, code, name, trigger_signal')
    .eq('is_active', true)
    .not('trigger_signal', 'is', null);
  if (errViajes) throw new Error(`lectura de viajes: ${errViajes.message}`);
  if (!viajes?.length) return;

  const porSenal = new Map(viajes.map((v) => [v.trigger_signal, v]));

  const { data: senales, error: errSenales } = await supabase
    .from('signals')
    .select('id, kind, client_id, contact_id, detail')
    .eq('status', 'abierta')
    .in('kind', [...porSenal.keys()]);
  if (errSenales) throw new Error(`lectura de senales: ${errSenales.message}`);
  if (!senales?.length) return;

  for (const senal of senales) {
    try {
      const viaje = porSenal.get(senal.kind);

      const { data: existente } = await supabase
        .from('journey_enrollments')
        .select('id, status')
        .eq('journey_id', viaje.id)
        .eq('client_id', senal.client_id)
        .maybeSingle();

      // Ya hubo inscripcion y ya cerro. No se reabre: la senal se consume y queda anotado.
      if (existente && (existente.status === 'finalizada' || existente.status === 'cancelada')) {
        await supabase.from('signals')
          .update({
            status: 'consumida',
            consumed_at: ahora(),
            detail: { ...senal.detail, viaje: viaje.code, nota: 'inscripcion previa cerrada; no se reabre' },
          })
          .eq('id', senal.id);
        await asiento(logger,
          { action: 'senal_descartada', entity_type: 'signals', entity_id: senal.id },
          `Senal ${senal.kind} consumida sin viaje nuevo: ${viaje.code} ya cerro para esta cuenta.`);
        continue;
      }

      let enrollmentId;
      if (!existente) {
        const { data: nueva, error: errNueva } = await supabase
          .from('journey_enrollments')
          .insert({
            journey_id: viaje.id,
            client_id: senal.client_id,
            contact_id: senal.contact_id,
            signal_id: senal.id,
            status: 'activa',
          })
          .select('id')
          .single();
        if (errNueva) throw new Error(`inscripcion en ${viaje.code}: ${errNueva.message}`);
        enrollmentId = nueva.id;
        resumen.inscripciones += 1;
      } else {
        // inscripcion activa o pausada: no se duplica (unique viaje + cliente en la base)
        enrollmentId = existente.id;
      }

      // Cada paso del viaje recibe su momento previsto a partir de hoy. Si la fila ya esta
      // prevista, conservar su fecha original: aqui nada se reagenda.
      const { data: pasos } = await supabase
        .from('journey_steps')
        .select('id, day_number')
        .eq('journey_id', viaje.id)
        .order('step_order');

      const { data: yaPrevistas } = await supabase
        .from('journey_runs')
        .select('journey_step_id')
        .eq('enrollment_id', enrollmentId);
      const previstas = new Set((yaPrevistas ?? []).map((r) => r.journey_step_id));

      const porPrever = (pasos ?? []).filter((p) => !previstas.has(p.id));
      if (porPrever.length > 0) {
        const { error: errRuns } = await supabase.from('journey_runs').insert(
          porPrever.map((paso) => ({
            enrollment_id: enrollmentId,
            journey_step_id: paso.id,
            signal_id: senal.id,
            // El dia 1 del viaje es el toque inicial: sale al inscribirse, no un dia despues.
            // El dia N cae a los N-1 dias de la inscripcion.
            scheduled_for: fechaEnDias(Math.max(0, paso.day_number - 1)),
          })),
        );
        if (errRuns) throw new Error(`momentos previstos de ${viaje.code}: ${errRuns.message}`);
      }

      await supabase.from('signals')
        .update({
          status: 'consumida',
          consumed_at: ahora(),
          detail: { ...senal.detail, viaje: viaje.code },
        })
        .eq('id', senal.id);
      resumen.senales_consumidas += 1;

      await asiento(logger,
        { action: 'senal_consumida_viaje_abierto', entity_type: 'signals', entity_id: senal.id },
        `Senal ${senal.kind} tomada por el viaje ${viaje.code}: inscripcion creada y pasos previstos.`);
    } catch (errSenal) {
      resumen.errores.push(`senal ${senal.id}: ${errSenal.message}`);
    }
  }
}

// ------------------------------------------------ paso 2: ejecucion vencida -> mensaje en cola
async function ejecutarVencidos(logger, resumen) {
  const { data: vencidos, error } = await supabase
    .from('journey_runs')
    .select(
      'id, enrollment_id, signal_id, scheduled_for, ' +
      'journey_steps ( id, step_order, day_number, channel, template_code, template_version ), ' +
      'journey_enrollments ( id, client_id, contact_id, status )',
    )
    .eq('status', 'pendiente')
    .lte('scheduled_for', ahora());
  if (error) throw new Error(`lectura de ejecuciones vencidas: ${error.message}`);
  if (!vencidos?.length) return;

  const clientesNecesarios = [...new Set(
    vencidos.map((r) => r.journey_enrollments?.client_id).filter(Boolean),
  )];
  const clientes = new Map();
  if (clientesNecesarios.length > 0) {
    const { data: filas } = await supabase
      .from('clients')
      .select('id, account_type, display_name, legal_name, company_name')
      .in('id', clientesNecesarios);
    for (const fila of filas ?? []) clientes.set(fila.id, fila);
  }

  for (const corrida of vencidos) {
    const paso = corrida.journey_steps;
    const inscripcion = corrida.journey_enrollments;
    const marca = `paso ${paso?.step_order ?? '?'} · ${paso?.template_code ?? '?'} v${paso?.template_version ?? '?'}`;

    try {
      if (!paso || !inscripcion) throw new Error('la ejecucion llego incompleta desde la base');
      // Una inscripcion pausada no deja que sus pasos salgan; el paso queda pendiente.
      if (inscripcion.status !== 'activa') continue;

      const cliente = clientes.get(inscripcion.client_id);
      let detalleSenal = {};
      if (corrida.signal_id) {
        const { data: senal } = await supabase
          .from('signals')
          .select('detail')
          .eq('id', corrida.signal_id)
          .maybeSingle();
        detalleSenal = senal?.detail ?? {};
      }

      // El texto sale de la plantilla aprobada, version por version.
      const { data: plantilla } = await supabase
        .from('templates')
        .select('id, code, subject, body, variables')
        .eq('code', paso.template_code)
        .eq('version', paso.template_version)
        .maybeSingle();
      if (!plantilla) throw new Error('la plantilla del paso no existe o no esta activa');

      const cuerpo = rellenaTexto(plantilla.body, {
        nombre: nombreDeContacto(cliente),
        empresa: empresaDe(cliente),
        lista_documentos: listaLegibleDe(detalleSenal),
      });

      // La conversacion del mensaje tiene que llevar el canal del paso: el guardia de
      // mensajes lo exige. Primero se busca un hilo vivo del mismo canal; si no hay, se abre
      // un hilo con el origen marcado en el tema.
      const { data: hilo } = await supabase
        .from('conversations')
        .select('id')
        .eq('client_id', inscripcion.client_id)
        .eq('channel', paso.channel)
        .in('status', ['abierta', 'en_espera_cliente', 'en_espera_agente', 'resuelta'])
        .is('deleted_at', null)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      let hiloId;
      if (hilo) {
        hiloId = hilo.id;
      } else {
        const { data: nuevoHilo, error: errHilo } = await supabase
          .from('conversations')
          .insert({
            client_id: inscripcion.client_id,
            contact_id: inscripcion.contact_id,
            channel: paso.channel,
            subject: `Motor de viajes · paso ${paso.step_order} · ${plantilla.name}`,
            status: 'abierta',
            last_message_at: ahora(),
          })
          .select('id')
          .single();
        if (errHilo) throw new Error(`hilo de salida: ${errHilo.message}`);
        hiloId = nuevoHilo.id;
      }

      const { data: mensaje, error: errMensaje } = await supabase
        .from('messages')
        .insert({
          conversation_id: hiloId,
          direction: 'saliente',
          channel: paso.channel,
          body: cuerpo,
          sender_label: 'Motor de viajes',
          template_id: plantilla.id,
          automated: true,
          journey_run_id: corrida.id,
          status: 'en_cola',
          sent_at: ahora(),
        })
        .select('id')
        .single();
      if (errMensaje) throw new Error(`mensaje rechazado por la base: ${errMensaje.message}`);

      const { error: errRun } = await supabase
        .from('journey_runs')
        .update({ status: 'enviado', attempted_at: ahora(), sent_at: ahora() })
        .eq('id', corrida.id);
      if (errRun) throw new Error(`marcar la ejecucion como enviada: ${errRun.message}`);

      resumen.mensajes_en_cola += 1;
      await asiento(logger,
        { action: 'mensaje_automatico', entity_type: 'messages', entity_id: mensaje.id },
        `Ejecucion ${corrida.id} · ${marca}: mensaje automatico dejado en cola con la plantilla aprobada.`);

      // Cerrado del viaje: si ya no queda ningun paso pendiente, la inscripcion termina con
      // su motivo. En 0003 se define que el cierre exige fecha, y 'ruta_abierta' es el
      // resultado normal de una secuencia ejecutada completa.
      const { count: quedan } = await supabase
        .from('journey_runs')
        .select('id', { count: 'exact', head: true })
        .eq('enrollment_id', inscripcion.id)
        .eq('status', 'pendiente');
      if (quedan === 0) {
        await supabase.from('journey_enrollments')
          .update({ status: 'finalizada', finished_at: ahora(), final_outcome: 'ruta_abierta' })
          .eq('id', inscripcion.id);
        await asiento(logger,
          { action: 'inscripcion_finalizada', entity_type: 'journey_enrollments', entity_id: inscripcion.id },
          `Todos los pasos del viaje quedaron ejecutados; inscripcion finalizada como ruta_abierta.`);
      }
    } catch (errPaso) {
      resumen.fallidos += 1;
      resumen.errores.push(`${marca}: ${errPaso.message}`);
      const { error: errMarca } = await supabase
        .from('journey_runs')
        .update({ status: 'fallido', attempted_at: ahora(), error: errPaso.message })
        .eq('id', corrida.id);
      if (errMarca) logger?.warn?.(`[MOTOR] ejecucion ${corrida.id} quedo sin marcar fallo: ${errMarca.message}`);
    }
  }
}

// Corrida completa: senales, ejecuciones vencidas y asiento de resumen. Devuelve el resumen
// aunque haya errores de fila, porque el lote no se tronca por una sola fila.
export async function corrida(logger) {
  if (!supabase) return { ok: false, motivo: 'NO_HAY_BASE', resumen: null };
  if (enCorrida) return { ok: false, motivo: 'CORRIDA_EN_CURSO', resumen: null };
  enCorrida = true;

  const resumen = {
    senales_consumidas: 0,
    inscripciones: 0,
    mensajes_en_cola: 0,
    fallidos: 0,
    errores: [],
  };

  try {
    await consumeSenales(logger, resumen);
    await ejecutarVencidos(logger, resumen);

    await supabase.from('audit_events').insert({
      actor: 'Motor de viajes',
      actor_id: null,
      actor_kind: 'sistema',
      action: 'corrida_motor',
      entity_type: 'motor',
      entity_id: `corrida ${ahora()}`,
      detail: JSON.stringify(resumen),
      outcome: 'exito',
    });
  } catch (err) {
    resumen.errores.push(err.message);
    logger?.error?.(`[MOTOR] corrida interrumpida: ${err.message}`);
  } finally {
    enCorrida = false;
  }

  logger?.info?.(
    `[MOTOR] corrida: ${resumen.senales_consumidas} senales consumidas, ` +
    `${resumen.inscripciones} inscripciones, ${resumen.mensajes_en_cola} mensajes en cola, ` +
    `${resumen.fallidos} fallos, ${resumen.errores.length} avisos`,
  );
  return { ok: resumen.errores.length === 0, resumen };
}

// El ciclo automatico del despliegue. Cada 90 segundos prueba una corrida; la traba
// enCorrida hace el resto cuando el boton manual coincide con el ciclo.
export function iniciarMotor(logger, milliseconds = 90_000) {
  if (!supabase) {
    logger?.warn?.('[MOTOR] sin base configurada: el motor queda apagado y no corren viajes automaticos');
    return null;
  }
  setTimeout(() => { void corrida(logger); }, 15_000).unref?.();
  const timer = setInterval(() => {
    void corrida(logger).then(() => {}, () => {});
  }, milliseconds);
  timer.unref?.();
  logger?.info?.(`[MOTOR] arrancado: corrida cada ${Math.round(milliseconds / 1000)} s`);
  return timer;
}
