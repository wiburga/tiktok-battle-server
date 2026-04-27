import os

app = Flask(__name__)
CORS(app)

# Event queue for SSE
event_queue = queue.Queue()
clients = []

@app.route('/event', methods=['POST'])
def receive_event():
    """
    Receives events from TikTok or simulation script.
    Expected format: {"type":"comment"|"gift"|"like"|"follow","user":"username","coins":10}
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "No JSON body"}), 400

    # Ensure timestamp is present
    data["timestamp"] = time.time()
    
    # Broadcast to all SSE clients
    broadcast(data)
    return jsonify({"ok": True, "received": data})

@app.route('/stream')
def stream():
    """Server-Sent Events endpoint"""
    def generate():
        client_queue = queue.Queue()
        clients.append(client_queue)
        yield "data: {\"type\":\"connected\"}\n\n"
        try:
            while True:
                event = client_queue.get()
                yield f"data: {json.dumps(event)}\n\n"
        except GeneratorExit:
            if client_queue in clients:
                clients.remove(client_queue)

    return Response(generate(), mimetype='text/event-stream', headers={
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
        'Connection': 'keep-alive'
    })

def broadcast(event):
    for client in clients:
        try:
            client.put_nowait(event)
        except Exception:
            pass

@app.route('/test/<event_type>')
def test_event(event_type):
    """Simulate events locally"""
    users = ["Alex", "Jordan", "Sam", "Skyler", "Charlie"]
    user = random.choice(users)
    
    event = {"type": event_type, "user": user}
    if event_type == "gift":
        event["coins"] = random.choice([1, 5, 10, 50])
    
    broadcast(event)
    return jsonify({"ok": True, "simulated": event})

@app.route('/')
def index():
    return send_file('index.html')

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 3000))
    print(f"TikTok Live Battle Server running on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)
