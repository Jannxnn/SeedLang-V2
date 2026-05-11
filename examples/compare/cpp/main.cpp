#include "httplib.h"
#include <fstream>
#include <sstream>
#include <mutex>
#include <vector>
#include <string>

struct Todo {
    int id;
    std::string text;
    bool done;
};

struct AppState {
    int counter = 0;
    int visits = 0;
    std::vector<Todo> todos = {{1, "Build dynamic API", false}, {2, "Connect Seed page", false}};
    int nextTodoId = 3;
    std::mutex mtx;
};

AppState g_state;

std::string readFile(const std::string& path) {
    std::ifstream f(path);
    return std::string(std::istreambuf_iterator<char>(f), {});
}

int main() {
    httplib::Server srv;

    srv.Get("/api/state", [](const httplib::Request&, httplib::Response& res) {
        std::lock_guard<std::mutex> lock(g_state.mtx);
        res.set_content("{\"counter\":" + std::to_string(g_state.counter)
            + ",\"visits\":" + std::to_string(g_state.visits)
            + ",\"todo_count\":" + std::to_string(g_state.todos.size()) + "}", "application/json");
    });

    srv.Get("/api/todos", [](const httplib::Request&, httplib::Response& res) {
        std::lock_guard<std::mutex> lock(g_state.mtx);
        std::string json = "[";
        for (size_t i = 0; i < g_state.todos.size(); i++) {
            if (i > 0) json += ",";
            const auto& t = g_state.todos[i];
            json += "{\"id\":" + std::to_string(t.id) + ",\"text\":\"" + t.text + "\",\"done\":" + (t.done ? "true" : "false") + "}";
        }
        json += "]";
        res.set_content(json, "application/json");
    });

    srv.Post("/api/todos", [](const httplib::Request& req, httplib::Response& res) {
        std::lock_guard<std::mutex> lock(g_state.mtx);
        Todo todo = {g_state.nextTodoId++, req.get_param_value("text"), false};
        if (todo.text.empty()) todo.text = "New task";
        g_state.todos.push_back(todo);
        res.status = 201;
        res.set_content("{\"ok\":true,\"id\":" + std::to_string(todo.id) + "}", "application/json");
    });

    srv.Delete(R"delim(/api/todos/(\d+))delim", [](const httplib::Request& req, httplib::Response& res) {
        int id = std::stoi(req.matches[1]);
        std::lock_guard<std::mutex> lock(g_state.mtx);
        g_state.todos.erase(std::remove_if(g_state.todos.begin(), g_state.todos.end(),
            [id](const Todo& t) { return t.id == id; }), g_state.todos.end());
        res.set_content("{\"ok\":true}", "application/json");
    });

    srv.Post(R"delim(/api/todos/(\d+)/toggle)delim", [](const httplib::Request& req, httplib::Response& res) {
        int id = std::stoi(req.matches[1]);
        std::lock_guard<std::mutex> lock(g_state.mtx);
        for (auto& t : g_state.todos) { if (t.id == id) t.done = !t.done; }
        res.set_content("{\"ok\":true}", "application/json");
    });

    srv.Post("/api/counter/increment", [](const httplib::Request&, httplib::Response& res) {
        std::lock_guard<std::mutex> lock(g_state.mtx);
        ++g_state.counter;
        res.set_content("{\"ok\":true,\"counter\":" + std::to_string(g_state.counter) + "}", "application/json");
    });

    srv.Post("/api/counter/decrement", [](const httplib::Request&, httplib::Response& res) {
        std::lock_guard<std::mutex> lock(g_state.mtx);
        --g_state.counter;
        res.set_content("{\"ok\":true,\"counter\":" + std::to_string(g_state.counter) + "}", "application/json");
    });

    srv.Post("/api/counter/reset", [](const httplib::Request&, httplib::Response& res) {
        std::lock_guard<std::mutex> lock(g_state.mtx);
        g_state.counter = 0;
        res.set_content("{\"ok\":true,\"counter\":0}", "application/json");
    });

    srv.Get("/", [](const httplib::Request&, httplib::Response& res) {
        std::lock_guard<std::mutex> lock(g_state.mtx);
        ++g_state.visits;
        auto html = readFile("index.html");
        res.set_content(html, "text/html; charset=utf-8");
    });

    srv.Get("/style.css", [](const httplib::Request&, httplib::Response& res) {
        res.set_content(readFile("style.css"), "text/css; charset=utf-8");
    });

    srv.Get("/app.js", [](const httplib::Request&, httplib::Response& res) {
        res.set_content(readFile("app.js"), "application/javascript; charset=utf-8");
    });

    std::cout << "C++ httplib server running at http://localhost:8080" << std::endl;

    srv.listen("127.0.0.1", 8080);

    return 0;
}
