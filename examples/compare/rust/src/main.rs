use actix_files::NamedFile;
use actix_web::{web, App, HttpServer, HttpResponse, Result};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

#[derive(Serialize, Deserialize, Clone)]
struct Todo {
    id: i32,
    text: String,
    done: bool,
}

#[derive(Serialize)]
struct StateResponse {
    counter: i32,
    visits: i32,
    todo_count: usize,
    server_time: String,
}

#[derive(Serialize)]
struct TodosResponse {
    todos: Vec<Todo>,
}

#[derive(Deserialize)]
struct AddTodoRequest {
    text: String,
}

#[derive(Serialize)]
struct OkResponse {
    ok: bool,
    counter: i32,
}

struct AppState {
    counter: Mutex<i32>,
    visits: Mutex<i32>,
    todos: Mutex<Vec<Todo>>,
    next_todo_id: Mutex<i32>,
}

async fn get_state(data: web::Data<AppState>) -> HttpResponse {
    let counter = *data.counter.lock().unwrap();
    let visits = *data.visits.lock().unwrap();
    let todos = data.todos.lock().unwrap();
    HttpResponse::Ok().json(StateResponse {
        counter,
        visits,
        todo_count: todos.len(),
        server_time: String::new(),
    })
}

async fn get_todos(data: web::Data<AppState>) -> HttpResponse {
    let todos = data.todos.lock().unwrap();
    HttpResponse::Ok().json(TodosResponse { todos: todos.clone() })
}

async fn add_todo(
    body: web::Json<AddTodoRequest>,
    data: web::Data<AppState>,
) -> HttpResponse {
    let mut next_id = data.next_todo_id.lock().unwrap();
    let todo = Todo { id: *next_id, text: body.text.clone(), done: false };
    *next_id += 1;
    let mut todos = data.todos.lock().unwrap();
    todos.push(todo.clone());
    HttpResponse::Created().json(TodosResponse { todos: todos.clone() })
}

async fn delete_todo(
    path: web::Path<(i32,)>,
    data: web::Data<AppState>,
) -> HttpResponse {
    let id = path.into_inner().0;
    let mut todos = data.todos.lock().unwrap();
    todos.retain(|t| t.id != id);
    HttpResponse::Ok().json(TodosResponse { todos: todos.clone() })
}

async fn toggle_todo(
    path: web::Path<(i32,)>,
    data: web::Data<AppState>,
) -> HttpResponse {
    let id = path.into_inner().0;
    let mut todos = data.todos.lock().unwrap();
    if let Some(t) = todos.iter_mut().find(|t| t.id == id) {
        t.done = !t.done;
    }
    HttpResponse::Ok().json(TodosResponse { todos: todos.clone() })
}

async fn increment_counter(data: web::Data<AppState>) -> HttpResponse {
    let mut counter = data.counter.lock().unwrap();
    *counter += 1;
    HttpResponse::Ok().json(OkResponse { ok: true, counter: *counter })
}

async fn decrement_counter(data: web::Data<AppState>) -> HttpResponse {
    let mut counter = data.counter.lock().unwrap();
    *counter -= 1;
    HttpResponse::Ok().json(OkResponse { ok: true, counter: *counter })
}

async fn reset_counter(data: web::Data<AppState>) -> HttpResponse {
    let mut counter = data.counter.lock().unwrap();
    *counter = 0;
    HttpResponse::Ok().json(OkResponse { ok: true, counter: *counter })
}

async fn index(data: web::Data<AppState>) -> Result<NamedFile> {
    let mut visits = data.visits.lock().unwrap();
    *visits += 1;
    Ok(NamedFile::open("static/index.html")?)
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let state = web::Data::new(AppState {
        counter: Mutex::new(0),
        visits: Mutex::new(0),
        next_todo_id: Mutex::new(3),
        todos: Mutex::new(vec![
            Todo { id: 1, text: "Build dynamic API".into(), done: false },
            Todo { id: 2, text: "Connect Seed page".into(), done: false },
        ]),
    });

    println!("Rust actix-web server running at http://localhost:9000");

    HttpServer::new(move || {
        App::new()
            .app_data(state.clone())
            .route("/", web::get().to(index))
            .route("/api/state", web::get().to(get_state))
            .route("/api/todos", web::get().to(get_todos))
            .route("/api/todos", web::post().to(add_todo))
            .route("/api/todos/{id}", web::delete().to(delete_todo))
            .route("/api/todos/{id}/toggle", web::post().to(toggle_todo))
            .route("/api/counter/increment", web::post().to(increment_counter))
            .route("/api/counter/decrement", web::post().to(decrement_counter))
            .route("/api/counter/reset", web::post().to(reset_counter))
            .service(actix_files::Files::new("/", "./static").index_file("index.html"))
    })
    .bind("127.0.0.1:9000")?
    .run()
    .await
}
