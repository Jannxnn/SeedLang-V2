from flask import Flask, render_template, jsonify, request, send_from_directory
import os

app = Flask(__name__, template_folder="templates", static_folder="static")

state = {
    "counter": 0,
    "visits": 0,
    "todos": [
        {"id": 1, "text": "Build dynamic API", "done": False},
        {"id": 2, "text": "Connect Seed page", "done": False}
    ],
    "next_todo_id": 3
}

@app.route("/api/state")
def get_state():
    return jsonify({
        "counter": state["counter"],
        "visits": state["visits"],
        "todoCount": len(state["todos"]),
        "serverTime": ""
    })

@app.route("/api/todos", methods=["GET"])
def get_todos():
    return jsonify({"todos": state["todos"]})

@app.route("/api/todos", methods=["POST"])
def add_todo():
    data = request.get_json(silent=True) or {}
    text = str(data.get("text", "")).strip()
    if not text:
        return jsonify({"ok": False, "error": "Todo text is required."}), 400
    todo = {"id": state["next_todo_id"], "text": text, "done": False}
    state["next_todo_id"] += 1
    state["todos"].append(todo)
    return jsonify({"ok": True, "todo": todo, "todos": state["todos"]}), 201

@app.route("/api/todos/<int:todo_id>", methods=["DELETE"])
def delete_todo(todo_id):
    state["todos"] = [t for t in state["todos"] if t["id"] != todo_id]
    return jsonify({"ok": True, "todos": state["todos"]})

@app.route("/api/todos/<int:todo_id>/toggle", methods=["POST"])
def toggle_todo(todo_id):
    target = next((t for t in state["todos"] if t["id"] == todo_id), None)
    if not target:
        return jsonify({"ok": False, "error": "Todo not found."}), 404
    target["done"] = not target["done"]
    return jsonify({"ok": True, "todo": target, "todos": state["todos"]})

@app.route("/api/counter/increment", methods=["POST"])
def increment_counter():
    state["counter"] += 1
    return jsonify({"ok": True, "counter": state["counter"]})

@app.route("/api/counter/decrement", methods=["POST"])
def decrement_counter():
    state["counter"] -= 1
    return jsonify({"ok": True, "counter": state["counter"]})

@app.route("/api/counter/reset", methods=["POST"])
def reset_counter():
    state["counter"] = 0
    return jsonify({"ok": True, "counter": state["counter"]})

@app.route("/")
def index():
    state["visits"] += 1
    return render_template("index.html")

if __name__ == "__main__":
    app.run(debug=True, port=5000)
