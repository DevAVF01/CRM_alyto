-- 0005: almacen de archivos del legajo (opcional, leer la nota)
--
-- NO ejecutar este archivo en el SQL Editor tal como esta.
--
-- storage.objects pertenece a un dueno interno de Supabase. Al correr estas sentencias
-- aparece "must be owner of table objects" aunque quien ejecuta sea el administrador del
-- proyecto. El camino correcto es el panel:
--
--   1. Almacen de archivos -> Nuevo cubo.
--   2. Nombre: expedientes. Acceso privado. Tamano maximo 10 MB.
--   3. Tipos permitidos: application/pdf, image/png, image/jpeg, application/msword y
--      application/vnd.openxmlformats-officedocument.wordprocessingml.document.
--   4. Almacen de archivos -> Archivos -> pestana "Policies". Bajar hasta la seccion
--      "Schema", fila "OTHER POLICIES UNDER STORAGE.OBJECTS", boton "New policy". Elegir la
--      segunda tarjeta ("For full customization / Create a policy from scratch"), no el
--      asistente de plantillas de la seccion "Buckets": esa escribe politicas por carpeta y
--      no admite condiciones con funciones.
--   5. En el formulario, el nombre de la politica, un unico "Allowed operation" (SELECT la
--      primera, INSERT la segunda), "Target roles" = authenticated, y la condicion en el
--      cajon grande: se llama "USING expression" con SELECT y "WITH CHECK expression" con
--      INSERT. Las dos condiciones son las que estan aqui abajo, sin el "create policy".
--
-- Nada del resto del esquema depende de este archivo: si no se ejecuta, las tablas funcionan
-- y solo falta donde subir los archivos.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'expedientes',
  'expedientes',
  false,
  10485760,
  array['application/pdf', 'image/png', 'image/jpeg', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do nothing;

-- Los archivos del legajo los leen administracion, cumplimiento y operaciones. Ventas y
-- soporte piden el documento a quien lo tiene, no lo descargan del almacen.
--
-- La segunda rama de la condicion no es un descuido: al subir un archivo, el cliente de
-- Storage pide la fila recien escrita. Si esa fila no es legible para quien la escribio, la
-- subida falla con "new row violates row-level security policy" aunque el permiso de subida
-- se lo permita. Por eso el que sube un documento ve el suyo, y solo el suyo.
--
-- La columna la rellena la plataforma con el sub de la declaracion de sesion. En proyectos
-- antiguos se llama owner; si al pegar esto en el panel aparece "column owner_id does not
-- exist", cambiar owner_id por owner en las dos politicas.
--
-- El ::text no es decoracion. owner_id esta declarado como text y current_user_id() devuelve
-- uuid (identificador universal unico). PostgreSQL no tiene un operador para comparar text con
-- uuid y responde 42883 "operator does not exist: text = uuid". Se baja el identificador al
-- tipo de la columna; nunca al reves, porque convertir el texto a uuid deja de usar indice.
create policy expedientes_read on storage.objects
  for select to authenticated using (
    bucket_id = 'expedientes'
    and (
      public.current_role_name() in ('admin', 'compliance', 'operaciones')
      or owner_id = (public.current_user_id())::text
    )
  );

-- Subir un documento al expediente lo hace cualquiera del equipo que atienda; cambiar el
-- estado de revision es otra cosa y vive en public.documents.
create policy expedientes_upload on storage.objects
  for insert to authenticated with check (
    bucket_id = 'expedientes'
    and public.current_role_name() in ('admin', 'compliance', 'operaciones', 'ventas', 'soporte')
  );
