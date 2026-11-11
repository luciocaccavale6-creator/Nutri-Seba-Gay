# Nutri Seba Gay 2.0

Aplicación web progresiva (PWA) para registrar comidas, seguir objetivos y consultar un asistente nutricional. La información personal se guarda localmente en el navegador. El backend mantiene la clave de OpenAI fuera del frontend.

## Requisitos

- Node.js 20 o superior.
- Una clave de API de OpenAI para usar el asistente, interpretar comidas y escanear fotos. El resto de la aplicación funciona sin esa clave.

## Archivos

- `index.html`: interfaz, cálculos, catálogo y almacenamiento local.
- `server.js`: backend Express y endpoints protegidos para OpenAI.
- `package.json`: dependencias y comandos.
- `sw.js`, `manifest.webmanifest`, `icon.svg`: instalación PWA y caché offline.
- `.env.example`: plantilla de configuración.
- `.gitignore`: excluye secretos y dependencias.

## Instalación

1. Instalá Node.js 20 o superior desde https://nodejs.org/.
2. Descomprimí el ZIP y abrí una terminal en la carpeta `nutri-seba-gay-2`.
3. Instalá dependencias:

   ```bash
   npm install
   ```

4. Copiá `.env.example` a `.env`.
5. Creá una clave secreta en https://platform.openai.com/api-keys.
6. Pegá la clave después de `OPENAI_API_KEY=` en `.env`. No la compartas ni la subas a Git.
7. Si querés, cambiá `OPENAI_MODEL` por otro modelo habilitado para tu cuenta.
8. Iniciá el servidor:

   ```bash
   npm start
   ```

9. Abrí http://localhost:3000.

Para desarrollo con reinicio automático: `npm run dev`.

## Instalar como PWA

Abrí la app desde `http://localhost:3000` o desde un dominio servido por HTTPS. En Chrome/Edge usá el ícono de instalación de la barra de direcciones o el menú «Instalar aplicación». En iPhone/iPad, usá Compartir → Agregar a pantalla de inicio.

## Offline y datos

- El perfil, catálogo, comidas, historial y estadísticas se guardan en `localStorage` del navegador.
- La interfaz y los recursos cacheados pueden abrirse offline después de la primera visita.
- Las llamadas a OpenAI requieren internet y una clave API configurada en el servidor.
- Los datos son locales a ese navegador/dispositivo; no hay sincronización entre dispositivos ni cuenta de usuario.
- Exportá periódicamente el historial desde Estadísticas → Exportar JSON para tener una copia.

## Cálculos y límites

El metabolismo basal usa Mifflin–St Jeor y el gasto diario multiplica por el nivel de actividad. Los objetivos de macros son estimaciones configurables. El IMC es orientativo y no es un diagnóstico. Los valores del catálogo y las porciones estimadas por IA son aproximados; verificá etiquetas y cantidades reales cuando sea importante.

La foto no permite determinar con precisión el peso, los aceites o ingredientes ocultos. La IA muestra una propuesta editable y no registra nada hasta que confirmes.

## API y costos

La app usa la API oficial de OpenAI mediante el backend y Responses API. La suscripción a ChatGPT y el uso de la API tienen facturación independiente. Revisá límites, consumo y facturación en https://platform.openai.com/usage y https://platform.openai.com/settings/organization/billing.

## Seguridad

- La clave vive únicamente en la variable de entorno `OPENAI_API_KEY` del servidor.
- No se envía al navegador ni se guarda en `localStorage`.
- `.env` está excluido de Git.
- Hay límite de solicitudes, límites de tamaño y validación de entrada/salida.
- Para publicar en internet, usá HTTPS, agregá autenticación y límites por usuario/IP adecuados, y configurá una política CSP antes de producción.
