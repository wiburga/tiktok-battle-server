# 🎮 TikTok Battle Server

Juego de batalla interactivo para TikTok Live, conectado a TikFinity via webhooks.

## Requisitos

- Python 3.8+
- TikFinity (gratuito) instalado en tu PC
- TikTok con 1,000+ seguidores para hacer Live

## Instalación

```bash
pip install flask flask-cors
python server.py
```

El servidor arranca en **http://localhost:3000**

## Configuración en TikFinity

1. Abre TikFinity → **Actions** → **New Action**
2. Configura 4 acciones (una por tipo de evento):

### 💬 Comentario → Spawn luchador
- Trigger: **Chat message**
- Action type: **Webhook**
- URL: `http://localhost:3000/event`
- Method: `POST`
- Body:
```json
{"type":"comment","user":"{{username}}","message":"{{message}}"}
```

### 🎁 Gift → Ataque especial
- Trigger: **Gift received**
- Action type: **Webhook**
- URL: `http://localhost:3000/event`
- Body:
```json
{"type":"gift","user":"{{username}}","gift":"{{giftName}}","coins":"{{coins}}"}
```

### ❤️ Like → Curar HP
- Trigger: **Like**
- Action type: **Webhook**
- URL: `http://localhost:3000/event`
- Body:
```json
{"type":"like","user":"{{username}}","count":"{{likeCount}}"}
```

### 🔔 Nuevo seguidor → Invocar BOSS
- Trigger: **New follower**
- Action type: **Webhook**
- URL: `http://localhost:3000/event`
- Body:
```json
{"type":"follow","user":"{{username}}"}
```

## Capturar en OBS / TikTok Live Studio

1. Agrega una fuente **Browser Source**
2. URL: `http://localhost:3000/`
3. Ancho: 480, Alto: 720 (o el tamaño de tu pantalla)
4. Marca **"Shutdown source when not visible"**

## Endpoints útiles

| URL | Descripción |
|-----|-------------|
| `GET /` | El juego (HTML) |
| `POST /event` | Recibe eventos de TikFinity |
| `GET /stream` | SSE — el juego se conecta aquí |
| `GET /stats` | Estadísticas del stream |
| `GET /test/comment` | Simular comentario |
| `GET /test/gift` | Simular gift |
| `GET /test/like` | Simular like |
| `GET /test/follow` | Simular seguidor/boss |

## Mecánicas del juego

| Evento TikTok | Efecto en el juego |
|---------------|-------------------|
| Comentario | Spawn de un luchador con el nombre del usuario |
| Gift | Ataque especial (daño proporcional a las coins) |
| Like | Cura HP a un luchador aleatorio |
| Nuevo seguidor | Aparece un BOSS que todos atacan juntos |
| Boss derrotado | +30 HP a todos los luchadores |
