-- seed.sql: datos iniciales del Entorno Controlado de Pruebas.
--
-- Como aplicar todo, en orden:
--   1) Crear el proyecto en el panel de Supabase.
--   2) Pegar los archivos de backend/supabase/migrations/ en el SQL Editor, en orden
--      numerado, o correr `supabase db push` con la interfaz de linea de comandos.
--   3) Ejecutar este archivo.
--   4) Dar de alta los usuarios. Este archivo NO crea cuentas de acceso: los usuarios
--      nacen en Auth (panel o API) y el disparador on_auth_user_created genera su perfil.
--      Para las cinco cuentas de demostracion, desde Auth > Add user, o por API:
--        POST /auth/admin/v1/signup  con {"email":"ventas@avfinance.bo",
--        "password":"...","email_confirm":true,"user_metadata":{"role":"ventas",
--        "display_name":"Fuerza de Ventas B2B"}}
--   5) En backend/.env cargar SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
--
-- Es idempotente: puede correrse dos veces sin duplicar filas.

-- Cuentas. El numero visible (code) es el mismo que usa la interfaz hoy.
insert into public.clients (code, name, nit, account_type, country, sector, source, kyc_status, health, volume_processed, monthly_limit, frequency)
values
  ('ECP-BOL-5577', 'Comercializadora del Valle S.A.', '1028493028', 'persona_juridica', 'Bolivia', 'Comercio Exterior', 'referido', 'En revision', 'En evaluacion', 184520, 250000, 14),
  ('ECP-BOL-8421', 'Grupo Andino S.R.L.', '1023904221', 'persona_juridica', 'Bolivia', 'Pago a Proveedores', 'alyto.io', 'En revision', 'Excelente', 680000, 500000, 2),
  ('ECP-BOL-6290', 'Importadora Pacífico', '1025117304', 'persona_juridica', 'Bolivia', 'Comercio Exterior', 'evento', 'Pendiente', 'Alta', 0, 750000, 1),
  ('ECP-BOL-3118', 'Logística Mercosur', '1028455119', 'persona_juridica', 'Bolivia', 'Transferencia Institucional B2B', 'referido', 'En revision', 'En Riesgo Documental', 120000, 420000, 4),
  ('ECP-BOL-1094', 'Corp. Agroindustrial del Sur', '1023390455', 'persona_juridica', 'Bolivia', 'Pago a Proveedores', 'alyto.io', 'Aprobado', 'Excelente', 990000, 400000, 1),
  ('ECP-BOL-7788', 'AgroIndustrial del Oriente', '1029976412', 'persona_juridica', 'Bolivia', 'Pago a Proveedores', 'alyto.io', 'Aprobado', 'Excelente', 1450000, 600000, 3),
  ('ECP-BOL-6633', 'Comercial Santa Cruz S.A.', '1026608850', 'persona_juridica', 'Bolivia', 'Comercio Exterior', 'referido', 'En revision', 'Alta', 82500, 300000, 1)
on conflict (code) do update set
  name = excluded.name,
  nit = excluded.nit,
  sector = excluded.sector,
  kyc_status = excluded.kyc_status,
  health = excluded.health,
  volume_processed = excluded.volume_processed,
  monthly_limit = excluded.monthly_limit,
  frequency = excluded.frequency;

-- Oportunidades dentro del embudo de 6 etapas. El numero visible de la oportunidad
-- coincide con el del expediente, igual que hace la interfaz hoy.
insert into public.deals (code, client_id, stage, deal_type, frequency, monthly_volume)
select v.code, c.id, v.stage, v.deal_type, v.frequency, v.monthly_volume
from (values
  ('ECP-BOL-8421', 5, 'Pago a Proveedor Internacional', 'Quincenal', 340000::numeric),
  ('ECP-BOL-6290', 3, 'Operación Comercial Exterior', 'Mensual', 750000),
  ('ECP-BOL-3118', 4, 'Transferencia Institucional B2B', 'Semanal', 420000),
  ('ECP-BOL-1094', 6, 'Pago a Proveedor Internacional', 'Mensual', 330000),
  ('ECP-BOL-5577', 6, 'Operación Comercial Exterior', 'Quincenal', 275000),
  ('ECP-BOL-7788', 6, 'Pago a Proveedor Internacional', 'Semanal', 520000),
  ('ECP-BOL-6633', 4, 'Operación Comercial Exterior', 'Mensual', 82500)
) as v(code, stage, deal_type, frequency, monthly_volume)
join public.clients c on c.code = v.code
on conflict (code) do update set
  stage = excluded.stage,
  deal_type = excluded.deal_type,
  frequency = excluded.frequency,
  monthly_volume = excluded.monthly_volume;

-- Contactos. Los nombres provienen del representante legal declarado; son ficticios.
insert into public.contacts (client_id, full_name, role_title, is_primary, decision_maker)
select c.id, v.full_name, v.role_title, true, v.decision_maker
from (values
  ('ECP-BOL-5577', 'Lic. Gonzalo Arze', 'Representante Legal', true),
  ('ECP-BOL-8421', 'Lic. Marcela Quiroga', 'Gerencia Financiera', true),
  ('ECP-BOL-6290', 'Lic. Fernando Salinas', 'Comercio Exterior', false),
  ('ECP-BOL-3118', 'Lic. Paola Arteaga', 'Dirección General', true),
  ('ECP-BOL-1094', 'Lic. Rodrigo Céspedes', 'Administración', true),
  ('ECP-BOL-7788', 'Lic. Carmen Luján', 'Gerencia Financiera', true),
  ('ECP-BOL-6633', 'Lic. Javier Monasterio', 'Representante Legal', true)
) as v(code, full_name, role_title, decision_maker)
join public.clients c on c.code = v.code
on conflict (client_id, full_name) where deleted_at is null do nothing;

-- Carteras custodiales. Se crean sin direccion publica a proposito: el conector de
-- Stellar es el que debe entregarla. Un valor inventado aqui se leeria como real.
insert into public.custodial_wallets (client_id, label, public_key, asset, balance)
select c.id, v.label, null, v.asset, v.balance
from public.clients c
cross join (values
  ('Wallet Custodial Principal', 'USDC', 0::numeric),
  ('Wallet Custodial Operativa', 'XLM', 0)
) as v(label, asset, balance)
on conflict (client_id, label) do nothing;

-- Operaciones de transferencias internacionales ya registradas. Las tres completadas
-- suman en el contador del dia en que se corre este archivo, no en la fecha simulada de
-- la operacion: el disparador cuenta el alta, y es dato de demostracion.
insert into public.transactions (code, client_id, beneficiary, destination, amount_usd, status, stellar_hash, created_at)
select v.code, c.id, v.beneficiary, v.destination, v.amount_usd, v.status, v.hash, v.made_at::timestamptz
from (values
  ('ECP-BOL-5577', 'TX-90031', 'Pacific Grain Logistics Inc.', 'Valparaíso, Chile', 42500::numeric, 'Completada en ECP', '8f92c10b9a43f6d01c5b27e4a8d36f10c2b4e7a91d05c3e6b8a1f2d4c7e903e1a', '2026-10-02T14:22:00Z'),
  ('ECP-BOL-5577', 'TX-90032', 'Andean Fertilizers Corp.', 'Lima, Perú', 19800, 'En Proceso', 'd32a764e0b1f4c9a8e5d2f6a0c3b7e91d4f8a2c5e7b0d3f6a9c2e5b8d1f4a55c2', '2026-10-08T09:10:00Z'),
  ('ECP-BOL-5577', 'TX-90033', 'AgroMaq Sudamericana S.A.', 'San Pablo, Brasil', 62220, 'Completada en ECP', '11c79a92d4e8b1f5a0c3e6b9d2f5a8c1e4b7d0f3a6c9e2b5d8f1a4c7e0b3f04f8', '2026-09-27T18:45:00Z'),
  ('ECP-BOL-7788', 'TX-90034', 'Global Seed Trading LLC', 'Buenos Aires, Argentina', 145000, 'Completada en ECP', 'a47c21e8f0b3d6a9c2e5b8d1f4a7c0e3b6d9f2a5c8e1b4d7f0a3c6e9b2d5a8c1', '2026-10-10T11:05:00Z'),
  ('ECP-BOL-6633', 'TX-90035', 'Andean Textile Group SpA', 'Santiago, Chile', 82500, 'En Revision ASFI', 'b58d32f9a1c4e7b0d3f6a9c2e5b8d1f4a7c0e3b6d9f2a5c8e1b4d7f0a3c6', '2026-10-11T16:30:00Z')
) as v(client_code, code, beneficiary, destination, amount_usd, status, hash, made_at)
join public.clients c on c.code = v.client_code
on conflict (code) do nothing;

-- Checklist de debida diligencia: las ocho casillas por expediente, con el estado
-- que hoy genera el almacen en memoria.
with template (key, label, detail) as (
  values
    ('personeria', 'Identificación y Personería Jurídica', 'Validado por Oficial de Cumplimiento'),
    ('origen-fondos', 'Verificación de Origen de Fondos', 'Límite: $us 250,000.00'),
    ('contrato-ecp', 'Contrato de Adhesión ECP', 'Requiere firma del representante legal'),
    ('transparencia', 'Protocolo de Transparencia de Operaciones', 'Ledger #492810 en Stellar Testnet'),
    ('ubo', 'Identificación de Beneficiarios Finales (UBO)', 'Umbral del 25% del capital'),
    ('listas', 'Listas Restrictivas Internacionales', 'OFAC / ONU / UE'),
    ('perfil-transaccional', 'Perfil Transaccional Declarado', 'Volumen y frecuencia estimados'),
    ('autorizacion-test', 'Autorización de Operación Test', 'Dictamen previo del Oficial de Cumplimiento')
)
insert into public.compliance_items (client_id, item_key, label, detail, status, document_required)
select c.id, t.key, t.label, t.detail,
  case
    when t.key in ('personeria', 'origen-fondos', 'listas') then 'Aprobado'
    when c.code in ('ECP-BOL-1094', 'ECP-BOL-7788') then 'Aprobado'
    when c.code in ('ECP-BOL-5577', 'ECP-BOL-3118') and t.key = 'contrato-ecp' then 'Observado'
    when c.code in ('ECP-BOL-5577', 'ECP-BOL-3118') and t.key = 'transparencia' then 'Aprobado'
    when c.code in ('ECP-BOL-5577', 'ECP-BOL-3118') and t.key in ('ubo', 'perfil-transaccional') then 'En revision'
    when t.key in ('transparencia', 'ubo') then 'En revision'
    else 'Pendiente'
  end::public.kyc_status,
  (t.key in ('personeria', 'origen-fondos', 'contrato-ecp', 'ubo'))
from public.clients c
cross join template t
where c.code like 'ECP-BOL-%'
on conflict (client_id, item_key) do nothing;

-- Etiquetas de trabajo.
insert into public.tags (name, color) values
  ('Comercio Exterior', '#1E3653'),
  ('Pago a Proveedores', '#0B1E36'),
  ('Prioridad Alta', '#F3D014'),
  ('Riesgo Documental', '#B42318')
on conflict (name) do nothing;

insert into public.client_tags (client_id, tag_id)
select c.id, t.id
from public.clients c
join public.tags t on t.name = case
  when c.health = 'En Riesgo Documental' then 'Riesgo Documental'
  when c.sector = 'Comercio Exterior' then 'Comercio Exterior'
  when c.sector = 'Pago a Proveedores' then 'Pago a Proveedores'
  else 'Prioridad Alta'
end
on conflict do nothing;

-- Actividades de ejemplo: solo si ya existe al menos un perfil de usuario, porque la
-- columna owner_id no admite vacio.
do $$
declare
  any_owner uuid;
begin
  select id into any_owner from public.profiles order by created_at limit 1;
  if any_owner is null then
    raise notice 'Sin perfiles de usuario todavia: se salteo la siembra de actividades';
    return;
  end if;

  insert into public.activities (client_id, deal_id, type, title, body, due_at, owner_id, created_by)
  select c.id, d.id, v.type::public.activity_type, v.title, v.body,
         now() + v.due_in_days * interval '1 day', any_owner, any_owner
  from (values
    ('ECP-BOL-6290', 'llamada', 'Primer contacto con Importadora Pacífico', 'Confirmar volumen mensual estimado y frecuencia de pagos al exterior.', 1),
    ('ECP-BOL-3118', 'tarea', 'Solicitar contrato de adhesión firmado', 'La casilla del contrato figura observada desde la ultima revision.', 0),
    ('ECP-BOL-8421', 'reunion', 'Presentación de la operación test', 'Revisar con operaciones el monto de la primera prueba.', 3)
  ) as v(code, type, title, body, due_in_days)
  join public.clients c on c.code = v.code
  left join public.deals d on d.client_id = c.id
  where not exists (
    select 1 from public.activities x
    where x.title = v.title and x.deleted_at is null
  );
end;
$$;

-- Asiento de auditoria del propio sembrado.
insert into public.audit_events (actor, action, detail)
select 'sistema', 'semilla_aplicada', 'Expedientes, embudo, checklist y operaciones del ECP cargados desde seed.sql'
where not exists (select 1 from public.audit_events where action = 'semilla_aplicada');
