const express = require("express");
const path = require("path");
const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const state = {
  counter: 0,
  visits: 0,
  todos: [
    { id: 1, text: "Build dynamic API", done: false },
    { id: 2, text: "Connect Seed page", done: false }
  ],
  nextTodoId: 3
};

app.get("/api/state", (req, res) => {
  res.json({
    counter: state.counter,
    visits: state.visits,
    todoCount: state.todos.length,
    serverTime: new Date().toISOString()
  });
});

app.get("/api/todos", (req, res) => {
  res.json({ todos: state.todos });
});

app.post("/api/todos", (req, res) => {
  const text = String(req.body.text || "").trim();
  if (!text) return res.status(400).json({ ok: false, error: "Todo text is required." });
  const todo = { id: state.nextTodoId, text, done: false };
  state.nextTodoId += 1;
  state.todos.push(todo);
  res.status(201).json({ ok: true, todo, todos: state.todos });
});

app.delete("/api/todos/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "Invalid todo id." });
  state.todos = state.todos.filter((item) => item.id !== id);
  res.json({ ok: true, todos: state.todos });
});

app.post("/api/todos/:id/toggle", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "Invalid todo id." });
  const target = state.todos.find((item) => item.id === id);
  if (!target) return res.status(404).json({ ok: false, error: "Todo not found." });
  target.done = !target.done;
  res.json({ ok: true, todo: target, todos: state.todos });
});

app.post("/api/counter/increment", (req, res) => {
  state.counter += 1;
  res.json({ ok: true, counter: state.counter });
});

app.post("/api/counter/decrement", (req, res) => {
  state.counter -= 1;
  res.json({ ok: true, counter: state.counter });
});

app.post("/api/counter/reset", (req, res) => {
  state.counter = 0;
  res.json({ ok: true, counter: state.counter });
});

app.get("/", (req, res) => {
  state.visits += 1;
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => {
  console.log(`JS Express server running at http://localhost:${port}`);
});
