-- 0006: diccionario del glosario institucional
--
-- Este archivo cita los terminos vetados a proposito: es el unico lugar donde tienen que
-- aparecer escritos. Esta excluido de la auditoria de marca de la integracion continua
-- (ver EXCLUDED en .github/workflows/ci.yml), igual que brandCopy.ts y el catalogo de
-- objeciones. Si se agrega otro fichero que defina el glosario, hay que sumarlo alli o la
-- auditoria falla de forma falsa.
--
-- Ejecutar despues de 0002, que es donde nace la tabla blocked_terms.
--
-- severidad 'bloqueo'  : el disparador impide escribir el mensaje.
-- severidad 'advertencia': se permite el envio y el mensaje aparece en vw_messages_flagged.

insert into public.blocked_terms (term, severity, suggestion, reason) values
  ('remesas', 'bloqueo', 'transferencias internacionales',
   'El glosario institucional no usa ese termino para el servicio de Alyto.'),
  ('remesa', 'bloqueo', 'transferencia internacional',
   'Misma razon en singular.'),
  ('plataforma de inversión', 'bloqueo', 'servicio de transferencias internacionales',
   'No se ofrece inversion ni rendimiento de capital.'),
  ('non-custodial', 'bloqueo', 'custodia institucional',
   'Las carteras del servicio son custodiales.'),
  ('noncustodial', 'bloqueo', 'custodia institucional',
   'Variacion sin guion del termino anterior.'),
  ('tenemos licencia', 'bloqueo', 'operamos en el Entorno Controlado de Pruebas de ASFI',
   'La autorizacion definitiva no existe todavia: afirmarla es incumplimiento.'),
  ('licencia completa', 'bloqueo', 'bajo supervision de ASFI en el ECP',
   'No se puede afirmar una licencia inexistente.'),
  ('regulados', 'advertencia', 'bajo supervision de ASFI',
   'La palabra suelta no dice bajo que regimen; conviene la forma completa.'),
  ('licenciados', 'advertencia', 'en el ECP de ASFI',
   'Mismo caso: el regimen hay que nombrarlo entero.'),
  ('somos los únicos', 'advertencia', 'sin comparaciones con otras entidades',
   'No se comparan servicios con los de otras entidades del ECP.')
on conflict (term) do update
  set severity = excluded.severity,
      suggestion = excluded.suggestion,
      reason = excluded.reason;
