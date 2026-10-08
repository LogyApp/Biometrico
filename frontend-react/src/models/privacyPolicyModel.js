const t = (text) => ({ text, strong: false });
const b = (text) => ({ text, strong: true });

export const PRIVACY_POLICY_TITLE = 'Política de Privacidad — Logyser S.A.S';

export const PRIVACY_POLICY_SECTIONS = [
  {
    title: 'Autorización de tratamiento de datos personales y biométricos',
    lines: [
      [
        t('En cumplimiento de la Ley Estatutaria 1581 de 2012 "Por la cual se dictan disposiciones generales para la protección de datos personales", el Decreto 1377 de 2013, el Decreto 1074 de 2015 y demás normas concordantes, '),
        b('Logyser S.A.S'),
        t(' (en adelante "la Empresa"), identificada con NIT, con domicilio en Colombia, actúa como '),
        b('responsable del tratamiento'),
        t(' de sus datos personales y biométricos.'),
      ],
    ],
  },
  {
    title: '1. Datos objeto de tratamiento',
    lines: [
      [t('La Empresa recopila y trata las siguientes categorías de datos:')],
      [b('(a) Datos de identificación: '), t('número de documento de identidad, tipo de documento, nombre completo y fecha de expedición del documento.')],
      [b('(b) Datos biométricos (datos sensibles): '), t('imagen facial capturada mediante cámara, de la cual se extraen vectores matemáticos de 512 dimensiones (embeddings ArcFace) para verificación de identidad. Las imágenes originales no se almacenan permanentemente.')],
      [b('(c) Datos de ubicación: '), t('coordenadas GPS al momento de cada evento de acceso o registro de asistencia.')],
      [b('(d) Datos técnicos del dispositivo: '), t('dirección IP, identificador único del dispositivo (huella digital técnica) y agente de navegador.')],
    ],
  },
  {
    title: '2. Finalidades del tratamiento — Art. 13, Ley 1581/2012',
    lines: [
      [t('(a) Verificar la identidad del titular en cada evento de acceso físico a instalaciones de la Empresa o de sus clientes.')],
      [t('(b) Registrar y auditar eventos de asistencia laboral (entradas, salidas y novedades).')],
      [t('(c) Prevenir el fraude, la suplantación de identidad y el acceso no autorizado a instalaciones.')],
      [t('(d) Cumplir obligaciones legales en materia de control de acceso, seguridad laboral y registros de nómina.')],
      [t('(e) Generar reportes internos de gestión del talento humano.')],
    ],
  },
  {
    title: '3. Base legal del tratamiento de datos sensibles — Art. 6 y 7, Ley 1581/2012',
    lines: [
      [
        t('De conformidad con el artículo 6 de la Ley 1581 de 2012, el tratamiento de datos sensibles —entre ellos los datos biométricos— está prohibido salvo cuando el titular haya otorgado su '),
        b('autorización explícita'),
        t('. El presente documento constituye dicha autorización, la cual es: (i) libre, es decir, no condicionada ni forzada; (ii) previa al inicio del tratamiento; (iii) expresa e informada sobre la finalidad y el alcance del mismo.'),
      ],
      [
        t('El titular podrá '),
        b('revocar esta autorización'),
        t(' en cualquier momento mediante comunicación escrita dirigida al área de Gestión Humana de Logyser S.A.S. La revocación impedirá el uso del sistema de control de acceso biométrico, sin perjuicio de los registros históricos que deban conservarse por mandato legal.'),
      ],
    ],
  },
  {
    title: '4. Medidas de seguridad',
    lines: [
      [t('La Empresa implementa medidas técnicas, administrativas y organizativas para proteger los datos, incluyendo: cifrado de datos en tránsito (TLS/HTTPS), control de acceso restringido a las bases de datos, almacenamiento de vectores matemáticos en lugar de imágenes originales (los vectores biométricos no permiten reconstruir la imagen facial), y auditorías periódicas de seguridad.')],
    ],
  },
  {
    title: '5. Plazo de conservación',
    lines: [
      [
        t('Los datos biométricos y registros de acceso se conservarán durante la vigencia de la relación laboral o contractual y por un período adicional de '),
        b('cinco (5) años'),
        t(' para efectos de auditoría y cumplimiento normativo, o el tiempo que exija la legislación aplicable. Transcurrido dicho plazo, los datos serán eliminados de forma segura.'),
      ],
    ],
  },
  {
    title: '6. Derechos del titular — Art. 8, Ley 1581/2012',
    lines: [
      [t('Como titular de los datos, usted tiene derecho a:')],
      [b('(a) Conocer '), t('los datos personales que la Empresa tiene sobre usted.')],
      [b('(b) Actualizar y rectificar '), t('sus datos cuando sean inexactos o incompletos.')],
      [b('(c) Solicitar prueba '), t('de la autorización otorgada.')],
      [b('(d) Ser informado '), t('sobre el uso dado a sus datos personales.')],
      [b('(e) Revocar '), t('la autorización o solicitar la supresión de sus datos cuando no se respeten los principios, derechos y garantías constitucionales y legales.')],
      [b('(f) Acceder gratuitamente '), t('a sus datos personales tratados.')],
      [b('(g) Presentar quejas '), t('ante la Superintendencia de Industria y Comercio (SIC) por infracciones a la normativa de protección de datos.')],
    ],
  },
  {
    title: '7. Transferencia y transmisión internacional de datos — Cap. VII, Ley 1581/2012',
    lines: [
      [
        t('Los datos personales y biométricos '),
        b('no serán cedidos, vendidos ni transferidos'),
        t(' a terceros sin autorización previa del titular, salvo: (i) cuando exista obligación legal o requerimiento de autoridad judicial o administrativa competente; (ii) cuando se trate de proveedores de servicios tecnológicos que actúen como encargados del tratamiento bajo contrato con cláusulas de confidencialidad y seguridad equivalentes a los estándares de la Ley 1581/2012.'),
      ],
    ],
  },
  {
    title: '8. Geolocalización',
    lines: [
      [t('La ubicación GPS se captura exclusivamente en el momento de cada registro de acceso o asistencia, con el único propósito de validar la localización del evento para fines de auditoría interna. Los datos de ubicación no se comparten con terceros ajenos a la operación de Logyser S.A.S y se almacenan de forma conjunta con el registro de asistencia.')],
    ],
  },
  {
    title: '9. Huella digital del dispositivo',
    lines: [
      [t('Se genera un identificador técnico único del dispositivo con base en características del navegador y del hardware (sin acceder a datos privados del sistema operativo). Este identificador se usa para asociar los registros biométricos a un dispositivo concreto, reforzando la seguridad del sistema. No identifica al titular de forma independiente.')],
    ],
  },
  {
    title: '10. Ejercicio de derechos — Contacto',
    lines: [
      [
        t('Para ejercer cualquiera de sus derechos como titular, presentar consultas o reclamos relacionados con el tratamiento de sus datos personales, comuníquese con el '),
        b('Área de Gestión Humana o de Tecnología de Logyser S.A.S'),
        t(' a través de los canales institucionales definidos por la Empresa. La Empresa dará respuesta dentro de los términos establecidos en los artículos 14 y 15 de la Ley 1581 de 2012 (10 días hábiles para consultas, 15 días hábiles para reclamos).'),
      ],
    ],
  },
];
