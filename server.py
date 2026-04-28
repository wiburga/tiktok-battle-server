"""
=============================================================================
 TikTok Live Battle Server - v2.0 (Estándar Comercial)
=============================================================================
 Servidor Flask con SSE para el juego de batallas en tiempo real de TikTok.
 Incluye integración con Tikfinity vía WebSocket, validación de esquemas JSON,
 sistema de logs profesional y gestión robusta de clientes SSE.
 
 Autor: EduGamesDev
 Licencia: MIT
=============================================================================
"""

import os
import json
import time
import queue
import collections
import random
import logging
import threading
import websocket
from datetime import datetime
from logging.handlers import RotatingFileHandler
from flask import Flask, request, jsonify, send_file, Response
from flask_cors import CORS


# =============================================================================
# Configuración de Logging Profesional
# =============================================================================

def configurar_logging():
    """Configura el sistema de logs con rotación de archivos y formato profesional."""
    formato = logging.Formatter(
        "[%(asctime)s] [%(levelname)-8s] [%(name)-15s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )

    # Logger principal
    logger = logging.getLogger("BattleServer")
    logger.setLevel(logging.DEBUG)

    # Handler de consola
    handler_consola = logging.StreamHandler()
    handler_consola.setLevel(logging.INFO)
    handler_consola.setFormatter(formato)
    logger.addHandler(handler_consola)

    # Handler de archivo con rotación (máx 5 archivos de 2MB)
    try:
        handler_archivo = RotatingFileHandler(
            "battle_server.log",
            maxBytes=2 * 1024 * 1024,
            backupCount=5,
            encoding="utf-8"
        )
        handler_archivo.setLevel(logging.DEBUG)
        handler_archivo.setFormatter(formato)
        logger.addHandler(handler_archivo)
    except PermissionError:
        logger.warning("No se pudo crear archivo de log, usando solo consola")

    return logger


log = configurar_logging()
log_tikfinity = logging.getLogger("BattleServer.Tikfinity")
log_sse = logging.getLogger("BattleServer.SSE")
log_eventos = logging.getLogger("BattleServer.Eventos")


# =============================================================================
# Aplicación Flask
# =============================================================================

app = Flask(__name__, static_folder="static", static_url_path="/static")
CORS(app)

# =============================================================================
# Constantes de Gameplay (Servidor)
# =============================================================================

CLASES_DISPONIBLES = ("guerrero", "arquero", "mago", "tanque", "zombie_knight")

# Rage colectivo (likes)
RAGE_MAX = int(os.environ.get("RAGE_MAX", "500"))
FRENESI_DURACION_S = float(os.environ.get("FRENESI_DURACION_S", "5"))

# Podio
TOP_N_PODIO = int(os.environ.get("TOP_N_PODIO", "3"))


# =============================================================================
# Esquemas de Validación JSON
# =============================================================================

ESQUEMAS_EVENTO = {
    "comment": {
        "campos_requeridos": ["type", "user"],
        "campos_opcionales": ["message", "timestamp"],
        "validaciones": {
            "user": lambda v: isinstance(v, str) and 1 <= len(v) <= 50,
            "message": lambda v: isinstance(v, str) and len(v) <= 500,
        }
    },
    "gift": {
        "campos_requeridos": ["type", "user"],
        "campos_opcionales": ["coins", "giftName", "giftTier", "repeatCount", "timestamp"],
        "validaciones": {
            "user": lambda v: isinstance(v, str) and 1 <= len(v) <= 50,
            "coins": lambda v: isinstance(v, (int, float)) and v >= 0,
            "repeatCount": lambda v: isinstance(v, int) and v >= 1,
            "giftTier": lambda v: v in ("LOW", "MEDIUM", "HIGH"),
            "giftName": lambda v: isinstance(v, str) and len(v) <= 100,
        }
    },
    "like": {
        "campos_requeridos": ["type", "user"],
        "campos_opcionales": ["likeCount", "timestamp"],
        "validaciones": {
            "user": lambda v: isinstance(v, str) and 1 <= len(v) <= 50,
            "likeCount": lambda v: isinstance(v, int) and v >= 1,
        }
    },
    "follow": {
        "campos_requeridos": ["type", "user"],
        "campos_opcionales": ["timestamp"],
        "validaciones": {
            "user": lambda v: isinstance(v, str) and 1 <= len(v) <= 50,
        }
    },
    "share": {
        "campos_requeridos": ["type", "user"],
        "campos_opcionales": ["timestamp"],
        "validaciones": {
            "user": lambda v: isinstance(v, str) and 1 <= len(v) <= 50,
        }
    },
    "multigift": {
        "campos_requeridos": ["type", "user", "coins"],
        "campos_opcionales": ["comboCount", "giftName", "timestamp"],
        "validaciones": {
            "user": lambda v: isinstance(v, str) and 1 <= len(v) <= 50,
            "coins": lambda v: isinstance(v, (int, float)) and v >= 0,
            "comboCount": lambda v: isinstance(v, int) and v >= 2,
        }
    },
}


def sanitizar_texto(texto):
    """Sanitiza texto de entrada eliminando caracteres peligrosos."""
    if not isinstance(texto, str):
        return str(texto)[:50]
    # Eliminar caracteres de control y limitar longitud
    limpio = "".join(c for c in texto if c.isprintable())
    return limpio[:50]

def sanitizar_texto_max(texto, max_len):
    """Sanitiza texto con longitud máxima configurable."""
    if not isinstance(texto, str):
        return str(texto)[:max_len]
    limpio = "".join(c for c in texto if c.isprintable())
    return limpio[:max_len]


def validar_evento(datos):
    """
    Valida un evento entrante contra los esquemas definidos.
    
    Args:
        datos: Diccionario con los datos del evento.
        
    Returns:
        tuple: (es_valido: bool, datos_limpios: dict, error: str|None)
    """
    if not isinstance(datos, dict):
        return False, None, "El cuerpo debe ser un objeto JSON"

    tipo = datos.get("type")
    if not tipo or not isinstance(tipo, str):
        return False, None, "Campo 'type' requerido y debe ser string"

    tipo = tipo.lower().strip()
    esquema = ESQUEMAS_EVENTO.get(tipo)

    if not esquema:
        tipos_validos = ", ".join(ESQUEMAS_EVENTO.keys())
        return False, None, f"Tipo '{tipo}' no válido. Tipos: {tipos_validos}"

    # Verificar campos requeridos
    for campo in esquema["campos_requeridos"]:
        if campo not in datos:
            return False, None, f"Campo requerido ausente: '{campo}'"

    # Construir datos limpios solo con campos permitidos
    campos_permitidos = esquema["campos_requeridos"] + esquema["campos_opcionales"]
    datos_limpios = {}

    for campo in campos_permitidos:
        if campo in datos:
            valor = datos[campo]
            # Sanitizar strings
            if isinstance(valor, str):
                if campo == "message":
                    valor = sanitizar_texto_max(valor, 500)
                elif campo == "giftName":
                    valor = sanitizar_texto_max(valor, 100)
                else:
                    valor = sanitizar_texto_max(valor, 50)
            # Validar si hay validación definida
            validacion = esquema["validaciones"].get(campo)
            if validacion and not validacion(valor):
                return False, None, f"Campo '{campo}' tiene un valor inválido"
            datos_limpios[campo] = valor

    datos_limpios["type"] = tipo
    return True, datos_limpios, None


# =============================================================================
# Clasificación de Regalos por Valor (Diamonds)
# =============================================================================

def clasificar_regalo(coins):
    """
    Clasifica un regalo en 3 categorías según su valor en diamantes.
    
    - LOW:    coins < 10     → Efecto básico (brillo leve, +5% HP)
    - MEDIUM: 10 <= coins < 500 → Efecto especial (boost tamaño/velocidad)
    - HIGH:   coins >= 500   → Efecto legendario (ataque global AOE)
    
    Args:
        coins: Valor en diamantes del regalo.
        
    Returns:
        str: "LOW", "MEDIUM" o "HIGH"
    """
    if not isinstance(coins, (int, float)):
        coins = 0
    
    if coins >= 500:
        return "HIGH"
    elif coins >= 10:
        return "MEDIUM"
    else:
        return "LOW"


# =============================================================================
# Gestión de Clientes SSE (Robusta)
# =============================================================================

class GestorClientesSSE:
    """
    Gestor robusto de clientes SSE con limpieza automática
    para prevenir fugas de memoria en sesiones largas.
    """

    def __init__(self, intervalo_limpieza=30, timeout_cliente=120):
        """
        Args:
            intervalo_limpieza: Segundos entre limpiezas automáticas.
            timeout_cliente: Segundos de inactividad para considerar muerto.
        """
        self._clientes = {}  # id -> {"queue": Queue, "creado": float, "activo": float}
        self._lock = threading.Lock()
        self._contador_id = 0
        self._intervalo_limpieza = intervalo_limpieza
        self._timeout_cliente = timeout_cliente
        self._activo = True

        # Historial de eventos para reconexión (soporte Last-Event-ID)
        self._historial = collections.deque(maxlen=10)
        self._event_id_counter = int(time.time() * 1000)

        # Hilo de limpieza periódica
        self._hilo_limpieza = threading.Thread(
            target=self._ciclo_limpieza,
            daemon=True,
            name="SSE-Limpieza"
        )
        self._hilo_limpieza.start()
        log_sse.info("Gestor de clientes SSE iniciado")

    def registrar_cliente(self):
        """
        Registra un nuevo cliente SSE.
        
        Returns:
            tuple: (client_id: int, client_queue: Queue)
        """
        with self._lock:
            self._contador_id += 1
            client_id = self._contador_id
            cola = queue.Queue(maxsize=100)  # Límite para evitar acumulación
            ahora = time.time()
            self._clientes[client_id] = {
                "queue": cola,
                "creado": ahora,
                "activo": ahora,
            }
            total = len(self._clientes)
        log_sse.info(f"Cliente #{client_id} conectado (total: {total})")
        return client_id, cola

    def desregistrar_cliente(self, client_id):
        """Elimina un cliente del registro."""
        with self._lock:
            if client_id in self._clientes:
                del self._clientes[client_id]
                total = len(self._clientes)
                log_sse.info(f"Cliente #{client_id} desconectado (total: {total})")

    def marcar_activo(self, client_id):
        """Marca un cliente como activo (recibió el último heartbeat)."""
        with self._lock:
            if client_id in self._clientes:
                self._clientes[client_id]["activo"] = time.time()

    def broadcast(self, evento):
        """
        Envía un evento a todos los clientes conectados.
        Descarta silenciosamente si la cola está llena.
        """
        clientes_muertos = []
        with self._lock:
            self._event_id_counter += 1
            evento["_id"] = str(self._event_id_counter)
            self._historial.append(evento)
            
            for client_id, info in self._clientes.items():
                try:
                    info["queue"].put_nowait(evento)
                except queue.Full:
                    clientes_muertos.append(client_id)
                    log_sse.warning(
                        f"Cola llena para cliente #{client_id}, marcando para eliminar"
                    )

        # Limpiar clientes con colas llenas
        for client_id in clientes_muertos:
            self.desregistrar_cliente(client_id)
            
    def obtener_historial(self, last_event_id=None):
        """Devuelve los eventos del historial recientes para reconexión."""
        with self._lock:
            if not last_event_id:
                return list(self._historial)
            try:
                last_id_int = int(last_event_id)
                return [ev for ev in self._historial if int(ev.get("_id", 0)) > last_id_int]
            except ValueError:
                return list(self._historial)

    def obtener_metricas(self):
        """Retorna métricas del gestor de clientes."""
        with self._lock:
            ahora = time.time()
            return {
                "total_clientes": len(self._clientes),
                "clientes": [
                    {
                        "id": cid,
                        "tiempo_conectado": round(ahora - info["creado"], 1),
                        "ultimo_activo": round(ahora - info["activo"], 1),
                    }
                    for cid, info in self._clientes.items()
                ]
            }

    def _ciclo_limpieza(self):
        """Ciclo periódico de limpieza de clientes inactivos."""
        while self._activo:
            time.sleep(self._intervalo_limpieza)
            self._limpiar_inactivos()

    def _limpiar_inactivos(self):
        """Elimina clientes que no han respondido al heartbeat."""
        ahora = time.time()
        clientes_inactivos = []
        with self._lock:
            for client_id, info in self._clientes.items():
                if ahora - info["activo"] > self._timeout_cliente:
                    clientes_inactivos.append(client_id)

        for client_id in clientes_inactivos:
            log_sse.warning(
                f"Eliminando cliente #{client_id} por inactividad"
            )
            self.desregistrar_cliente(client_id)


# Instancia global del gestor de clientes
gestor_sse = GestorClientesSSE()


# =============================================================================
# Sistema de Niveles (Estado en Memoria)
# =============================================================================

class SistemaUsuarios:
    """Gestiona el estado persistente de usuarios durante la sesión."""

    def __init__(self):
        self._usuarios = {}  # nombre -> estado
        self._lock = threading.Lock()

    def obtener_o_crear(self, nombre):
        """Obtiene o crea datos de usuario."""
        with self._lock:
            if nombre not in self._usuarios:
                clase = random.choice(CLASES_DISPONIBLES)
                self._usuarios[nombre] = {
                    "xp": 0,
                    "nivel": 1,
                    "kills": 0,
                    "boss_kills": 0,
                    "clase": clase,
                    "gift_coins": 0,
                    "damage_total": 0.0,
                }
            return self._usuarios[nombre].copy()

    def obtener_clase(self, nombre):
        with self._lock:
            if nombre not in self._usuarios:
                # crea usuario y asigna clase
                self._usuarios[nombre] = {
                    "xp": 0,
                    "nivel": 1,
                    "kills": 0,
                    "boss_kills": 0,
                    "clase": random.choice(CLASES_DISPONIBLES),
                    "gift_coins": 0,
                    "damage_total": 0.0,
                }
            return self._usuarios[nombre]["clase"]

    def agregar_xp(self, nombre, cantidad):
        """
        Agrega XP a un usuario y verifica subida de nivel.
        
        Returns:
            dict con datos actualizados y si subió de nivel.
        """
        with self._lock:
            if nombre not in self._usuarios:
                clase = random.choice(CLASES_DISPONIBLES)
                self._usuarios[nombre] = {
                    "xp": 0,
                    "nivel": 1,
                    "kills": 0,
                    "boss_kills": 0,
                    "clase": clase,
                    "gift_coins": 0,
                    "damage_total": 0.0,
                }

            usuario = self._usuarios[nombre]
            usuario["xp"] += cantidad
            subio_nivel = False
            nivel_anterior = usuario["nivel"]

            # XP necesario: nivel * 100
            while usuario["xp"] >= usuario["nivel"] * 100:
                usuario["xp"] -= usuario["nivel"] * 100
                usuario["nivel"] += 1
                subio_nivel = True

            return {
                **usuario,
                "subio_nivel": subio_nivel,
                "nivel_anterior": nivel_anterior,
            }

    def agregar_gift(self, nombre, coins):
        with self._lock:
            if nombre not in self._usuarios:
                self.obtener_o_crear(nombre)
            if isinstance(coins, (int, float)) and coins > 0:
                self._usuarios[nombre]["gift_coins"] += int(coins)

    def agregar_damage(self, nombre, cantidad):
        with self._lock:
            if nombre not in self._usuarios:
                self.obtener_o_crear(nombre)
            if isinstance(cantidad, (int, float)) and cantidad > 0:
                self._usuarios[nombre]["damage_total"] += float(cantidad)

    def registrar_kill(self, nombre, es_boss=False):
        """Registra una eliminación."""
        with self._lock:
            if nombre in self._usuarios:
                self._usuarios[nombre]["kills"] += 1
                if es_boss:
                    self._usuarios[nombre]["boss_kills"] += 1

    def obtener_ranking(self, limite=10):
        """Obtiene el ranking de usuarios por nivel y XP."""
        with self._lock:
            ranking = sorted(
                self._usuarios.items(),
                key=lambda x: (x[1]["nivel"], x[1]["xp"]),
                reverse=True
            )
            return [
                {"nombre": nombre, **datos}
                for nombre, datos in ranking[:limite]
            ]

    def top_podio(self, n=3):
        with self._lock:
            def score(d):
                # peso principal: daño; secundario: coins
                return (d.get("damage_total", 0.0) * 1.0) + (d.get("gift_coins", 0) * 0.25)

            items = [(nombre, datos.copy()) for nombre, datos in self._usuarios.items()]
            items.sort(key=lambda it: score(it[1]), reverse=True)
            top = []
            for nombre, datos in items[: max(1, n)]:
                top.append({
                    "user": nombre,
                    "clase": datos.get("clase", "guerrero"),
                    "nivel": datos.get("nivel", 1),
                    "damage": round(float(datos.get("damage_total", 0.0)), 1),
                    "giftCoins": int(datos.get("gift_coins", 0)),
                })
            return top


sistema_usuarios = SistemaUsuarios()


# =============================================================================
# Estadísticas de la Sesión
# =============================================================================

class EstadisticasSesion:
    """Rastrea estadísticas de la sesión actual."""

    def __init__(self):
        self.inicio = time.time()
        self.total_eventos = 0
        self.eventos_por_tipo = {}
        self.total_gifts = 0
        self.total_coins = 0
        self._lock = threading.Lock()

    def registrar_evento(self, tipo, coins=0):
        """Registra un evento en las estadísticas."""
        with self._lock:
            self.total_eventos += 1
            self.eventos_por_tipo[tipo] = self.eventos_por_tipo.get(tipo, 0) + 1
            if tipo in ("gift", "multigift"):
                self.total_gifts += 1
                self.total_coins += coins

    def obtener(self):
        """Retorna las estadísticas actuales."""
        with self._lock:
            return {
                "tiempo_sesion": round(time.time() - self.inicio, 1),
                "total_eventos": self.total_eventos,
                "por_tipo": dict(self.eventos_por_tipo),
                "total_gifts": self.total_gifts,
                "total_coins": self.total_coins,
            }


estadisticas = EstadisticasSesion()

# =============================================================================
# Rage Colectiva (Estado en Memoria)
# =============================================================================

class RageColectiva:
    def __init__(self, maximo):
        self.maximo = maximo
        self.actual = 0
        self.frenesi_hasta = 0.0
        self._lock = threading.Lock()

    def agregar_likes(self, cantidad):
        if not isinstance(cantidad, int):
            try:
                cantidad = int(cantidad)
            except Exception:
                cantidad = 1
        cantidad = max(1, min(cantidad, 5000))

        ahora = time.time()
        with self._lock:
            if ahora < self.frenesi_hasta:
                return {
                    "activated": False,
                    "value": self.actual,
                    "max": self.maximo,
                    "frenzyActive": True,
                    "frenzyUntil": self.frenesi_hasta,
                }

            self.actual = min(self.maximo, self.actual + cantidad)
            activado = self.actual >= self.maximo
            if activado:
                self.actual = 0
                self.frenesi_hasta = ahora + FRENESI_DURACION_S

            return {
                "activated": activado,
                "value": self.actual,
                "max": self.maximo,
                "frenzyActive": activado,
                "frenzyUntil": self.frenesi_hasta,
            }

    def estado(self):
        ahora = time.time()
        with self._lock:
            return {
                "value": self.actual,
                "max": self.maximo,
                "frenzyActive": ahora < self.frenesi_hasta,
                "frenzyUntil": self.frenesi_hasta,
            }


rage = RageColectiva(RAGE_MAX)


# =============================================================================
# Rutas de la API
# =============================================================================

@app.route("/ping")
def ping():
    """Endpoint ligero para mantener vivo el servidor (Keep-Alive)."""
    return jsonify({"status": "ok", "timestamp": time.time()})

@app.route("/")
def index():
    """Sirve la página principal del juego."""
    log.debug("Sirviendo index.html")
    return send_file("index.html")


@app.route("/event", methods=["POST"])
def recibir_evento():
    """
    Recibe eventos desde Tikfinity u otras fuentes.
    Valida el esquema JSON antes de procesar.
    """
    datos = request.get_json(silent=True)
    if not datos:
        log_eventos.warning("Evento rechazado: cuerpo JSON vacío o inválido")
        return jsonify({"error": "Cuerpo JSON requerido"}), 400

    # Validar esquema
    es_valido, datos_limpios, error = validar_evento(datos)
    if not es_valido:
        log_eventos.warning(f"Evento rechazado: {error}")
        return jsonify({"error": error}), 422

    # Agregar timestamp del servidor
    datos_limpios["timestamp"] = time.time()

    # Enriquecer con datos de usuario (nivel, xp)
    nombre = datos_limpios.get("user", "unknown")
    info_usuario = sistema_usuarios.obtener_o_crear(nombre)
    datos_limpios["nivel"] = info_usuario["nivel"]
    datos_limpios["xp"] = info_usuario["xp"]
    datos_limpios["class"] = info_usuario.get("clase", "guerrero")

    # Clasificar regalo si es de tipo gift
    if datos_limpios["type"] == "gift":
        coins = datos_limpios.get("coins", 1)
        datos_limpios["giftTier"] = clasificar_regalo(coins)
        sistema_usuarios.agregar_gift(nombre, coins)
        log_eventos.info(
            f"Regalo de {nombre}: {coins} 💎 → tier {datos_limpios['giftTier']}"
        )

    # Likes → Rage colectiva (barra global + frenesí)
    if datos_limpios["type"] == "like":
        like_count = datos_limpios.get("likeCount", 1)
        estado_rage = rage.agregar_likes(like_count if isinstance(like_count, int) else 1)
        gestor_sse.broadcast({
            "type": "rage_update",
            "value": estado_rage["value"],
            "max": estado_rage["max"],
            "timestamp": time.time(),
        })
        if estado_rage.get("activated"):
            gestor_sse.broadcast({
                "type": "frenzy",
                "duration": FRENESI_DURACION_S,
                "timestamp": time.time(),
            })

    # SHARE → invocación aliada (Gólem de Hierro)
    if datos_limpios["type"] == "share":
        gestor_sse.broadcast({
            "type": "summon_golem",
            "user": nombre,
            "timestamp": time.time(),
        })

    # Registrar estadísticas
    estadisticas.registrar_evento(
        datos_limpios["type"],
        coins=datos_limpios.get("coins", 0)
    )

    # Broadcast a todos los clientes SSE
    gestor_sse.broadcast(datos_limpios)
    log_eventos.info(
        f"Evento procesado: {datos_limpios['type']} de {nombre} "
        f"(nivel {info_usuario['nivel']})"
    )

    return jsonify({"ok": True, "recibido": datos_limpios})


@app.route("/stream")
def stream():
    """
    Endpoint SSE para clientes del juego.
    Mantiene conexión abierta con heartbeat cada 15s.
    Soporta reconexión sin perder eventos mediante Last-Event-ID.
    """
    last_event_id = request.headers.get("Last-Event-ID")

    def generar():
        client_id, cola = gestor_sse.registrar_cliente()

        # Enviar historial si hay reconexión para no perder eventos
        historial = gestor_sse.obtener_historial(last_event_id)
        for ev in historial:
            event_id = ev.get('_id')
            if event_id:
                yield f"id: {event_id}\ndata: {json.dumps(ev)}\n\n"

        # Evento de conexión con estado inicial
        yield f"data: {json.dumps({'type': 'connected', 'clientId': client_id})}\n\n"

        try:
            while True:
                try:
                    evento = cola.get(timeout=15)
                    event_id = evento.get('_id')
                    if event_id:
                        yield f"id: {event_id}\ndata: {json.dumps(evento)}\n\n"
                    else:
                        yield f"data: {json.dumps(evento)}\n\n"
                except queue.Empty:
                    # Heartbeat para mantener la conexión
                    gestor_sse.marcar_activo(client_id)
                    yield f"data: {json.dumps({'type': 'ping', 'ts': time.time()})}\n\n"
        except GeneratorExit:
            gestor_sse.desregistrar_cliente(client_id)
        except Exception as e:
            log_sse.error(f"Error en conexión SSE #{client_id}: {e}")
            gestor_sse.desregistrar_cliente(client_id)

    return Response(generar(), mimetype="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
    })


@app.route("/xp", methods=["POST"])
def agregar_xp():
    """
    Endpoint para que el frontend reporte XP ganada.
    El frontend informa cuando un luchador sobrevive a un boss.
    """
    datos = request.get_json(silent=True)
    if not datos:
        return jsonify({"error": "JSON requerido"}), 400

    nombre = sanitizar_texto(datos.get("user", ""))
    cantidad = datos.get("amount", 0)
    es_boss_kill = datos.get("bossKill", False)

    if not nombre or not isinstance(cantidad, (int, float)) or cantidad <= 0:
        return jsonify({"error": "Parámetros inválidos"}), 422

    resultado = sistema_usuarios.agregar_xp(nombre, int(cantidad))

    if es_boss_kill:
        sistema_usuarios.registrar_kill(nombre, es_boss=True)

    # Si subió de nivel, notificar a todos los clientes
    if resultado["subio_nivel"]:
        evento_nivel = {
            "type": "levelup",
            "user": nombre,
            "nivel": resultado["nivel"],
            "nivel_anterior": resultado["nivel_anterior"],
            "timestamp": time.time(),
        }
        gestor_sse.broadcast(evento_nivel)
        log_eventos.info(
            f"¡{nombre} subió a nivel {resultado['nivel']}!"
        )

    return jsonify({"ok": True, "usuario": resultado})

@app.route("/damage", methods=["POST"])
def reportar_damage():
    """
    Reporte de daño desde el frontend (para Podio).
    Body: {user: str, amount: number, targetType: 'boss'|'fighter'}
    """
    datos = request.get_json(silent=True)
    if not datos:
        return jsonify({"error": "JSON requerido"}), 400

    nombre = sanitizar_texto_max(datos.get("user", ""), 50)
    cantidad = datos.get("amount", 0)
    target_type = sanitizar_texto_max(datos.get("targetType", "boss"), 10).lower()

    if not nombre or not isinstance(cantidad, (int, float)) or cantidad <= 0:
        return jsonify({"error": "Parámetros inválidos"}), 422

    if target_type == "boss":
        sistema_usuarios.agregar_damage(nombre, float(cantidad))

    return jsonify({"ok": True})

@app.route("/podium")
def podium():
    """Devuelve el Top N para el Podio."""
    return jsonify({"top": sistema_usuarios.top_podio(TOP_N_PODIO)})


@app.route("/ranking")
def ranking():
    """Retorna el ranking de usuarios por nivel."""
    return jsonify({"ranking": sistema_usuarios.obtener_ranking()})


@app.route("/stats")
def stats():
    """Retorna estadísticas de la sesión y métricas SSE."""
    return jsonify({
        "sesion": estadisticas.obtener(),
        "sse": gestor_sse.obtener_metricas(),
        "rage": rage.estado(),
    })


@app.route("/test/<tipo_evento>")
def evento_prueba(tipo_evento):
    """
    Genera un evento de prueba para testing.
    Soporta: comment, gift, like, follow, share, multigift
    """
    usuarios = ["Alex", "Jordan", "Sam", "Skyler", "Charlie",
                 "Luna", "Neo", "Pixel", "Blaze", "Storm"]
    usuario = random.choice(usuarios)

    evento = {"type": tipo_evento, "user": usuario, "timestamp": time.time()}

    if tipo_evento == "gift":
        # Rotar entre los 3 tiers para testing: LOW, MEDIUM, HIGH
        coins = random.choice([1, 5, 25, 100, 500, 1000])
        evento["coins"] = coins
        evento["giftTier"] = clasificar_regalo(coins)
        nombres_regalo = {
            "LOW": ["Rosa", "Corazón", "Estrella"],
            "MEDIUM": ["Delfín", "Universo", "León"],
            "HIGH": ["Interstellar", "Galaxia", "TikTok Universe"],
        }
        evento["giftName"] = random.choice(nombres_regalo[evento["giftTier"]])
    elif tipo_evento == "multigift":
        evento["coins"] = random.choice([50, 100, 200, 500])
        evento["comboCount"] = random.choice([3, 5, 10])
    elif tipo_evento == "share":
        pass  # Share no necesita campos extra

    # Enriquecer con nivel
    info = sistema_usuarios.obtener_o_crear(usuario)
    evento["nivel"] = info["nivel"]
    evento["class"] = info.get("clase", "guerrero")

    # Validar antes de emitir
    es_valido, datos_limpios, error = validar_evento(evento)
    if es_valido:
        datos_limpios["timestamp"] = time.time()
        datos_limpios["nivel"] = info["nivel"]
        datos_limpios["class"] = info.get("clase", "guerrero")
        gestor_sse.broadcast(datos_limpios)
        estadisticas.registrar_evento(tipo_evento)
        log_eventos.debug(f"Evento de prueba: {tipo_evento} de {usuario}")
        return jsonify({"ok": True, "simulado": datos_limpios})
    else:
        return jsonify({"error": error}), 422


# =============================================================================
# Conexión con Tikfinity (WebSocket)
# =============================================================================

def conectar_tikfinity():
    """
    Establece conexión WebSocket con Tikfinity.
    Reconexión automática con backoff exponencial.
    """
    estado = {"intentos": 0}
    max_espera = 60

    def on_message(ws, message):
        estado["intentos"] = 0
        try:
            datos = json.loads(message)
            tipo_evento = datos.get("event")
            payload = datos.get("data", {})

            mapa_tipos = {
                "chat": "comment", "gift": "gift", "like": "like",
                "follow": "follow", "share": "share",
                "member": "comment", "roomUser": None,
            }

            tipo_mapeado = mapa_tipos.get(tipo_evento)
            if not tipo_mapeado:
                return

            nombre_usuario = sanitizar_texto(
                payload.get("uniqueId") or payload.get("nickname") or "unknown"
            )
            evento = {
                "type": tipo_mapeado,
                "user": nombre_usuario,
                "timestamp": time.time(),
            }

            if tipo_mapeado == "gift":
                diamantes = payload.get("diamondCount", 1)
                repeat_count = payload.get("repeatCount", 1)
                evento["coins"] = diamantes
                evento["giftTier"] = clasificar_regalo(diamantes)
                evento["giftName"] = sanitizar_texto(
                    payload.get("giftName") or payload.get("gift_name") or "Gift"
                )
                if repeat_count >= 3:
                    evento["type"] = "multigift"
                    evento["comboCount"] = repeat_count
                log_tikfinity.info(
                    f"Regalo: {diamantes}💎 ({evento['giftTier']}) de {nombre_usuario}"
                )

            info = sistema_usuarios.obtener_o_crear(nombre_usuario)
            evento["nivel"] = info["nivel"]
            evento["class"] = info.get("clase", "guerrero")
            estadisticas.registrar_evento(evento["type"], coins=evento.get("coins", 0))

            if evento["type"] == "gift":
                sistema_usuarios.agregar_gift(nombre_usuario, evento.get("coins", 0))

            if evento["type"] == "like":
                estado_rage = rage.agregar_likes(payload.get("likeCount", 1) or 1)
                gestor_sse.broadcast({
                    "type": "rage_update",
                    "value": estado_rage["value"],
                    "max": estado_rage["max"],
                    "timestamp": time.time(),
                })
                if estado_rage.get("activated"):
                    gestor_sse.broadcast({
                        "type": "frenzy",
                        "duration": FRENESI_DURACION_S,
                        "timestamp": time.time(),
                    })

            if evento["type"] == "share":
                gestor_sse.broadcast({
                    "type": "summon_golem",
                    "user": nombre_usuario,
                    "timestamp": time.time(),
                })

            gestor_sse.broadcast(evento)
            log_tikfinity.info(f"{evento['type']} de {nombre_usuario} (nivel {info['nivel']})")

        except json.JSONDecodeError as e:
            log_tikfinity.error(f"JSON inválido recibido: {e}")
        except Exception as e:
            log_tikfinity.error(f"Error procesando mensaje: {e}", exc_info=True)

    def on_error(ws, error):
        log_tikfinity.error(f"Error WebSocket: {error}")

    def on_close(ws, close_status_code, close_msg):
        pass  # El bucle principal maneja la reconexión

    def on_open(ws):
        estado["intentos"] = 0
        log_tikfinity.info("✓ Conectado al WebSocket de Tikfinity")

    ws_url = os.environ.get("TIKFINITY_WS_URL", "ws://localhost:21213/")

    while True:
        estado["intentos"] += 1
        espera = min(5 * (2 ** (estado["intentos"] - 1)), max_espera)
        log_tikfinity.info(f"Conectando a Tikfinity en {ws_url} (intento #{estado['intentos']})...")

        ws = websocket.WebSocketApp(
            ws_url,
            on_message=on_message,
            on_error=on_error,
            on_close=on_close,
            on_open=on_open,
        )
        ws.run_forever(ping_interval=30, ping_timeout=10)

        log_tikfinity.warning(f"Desconectado, reconectando en {espera}s...")
        time.sleep(espera)


# Iniciar conexión con Tikfinity en hilo daemon
threading.Thread(
    target=conectar_tikfinity,
    daemon=True,
    name="Tikfinity-WS"
).start()


# =============================================================================
# Punto de Entrada
# =============================================================================

if __name__ == "__main__":
    puerto = int(os.environ.get("PORT", 3000))
    log.info("=" * 60)
    log.info("  TikTok Live Battle Server v2.0")
    log.info(f"  Puerto: {puerto}")
    log.info(f"  Tikfinity WS: {os.environ.get('TIKFINITY_WS_URL', 'ws://localhost:21213/')}")
    log.info("=" * 60)
    app.run(host="0.0.0.0", port=puerto, debug=False, threaded=True)