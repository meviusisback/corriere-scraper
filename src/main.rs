use axum::{routing::get, Json, Router};
use chrono::{DateTime, Utc};
// use reqwest::Error; // removed unused import
use scraper::{Html, Selector};
use serde::Serialize;
use std::net::SocketAddr;
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;

#[derive(Serialize)]
struct NewsItem {
    title: String,
    description: String,
    link: String,
    image_url: Option<String>,
}

#[derive(Serialize)]
struct NewsResponse {
    scraped_at: DateTime<Utc>,
    news: Vec<NewsItem>,
}

#[tokio::main]
async fn main() {
    // Enable CORS
    let cors = CorsLayer::permissive();

    let app = Router::new()
        .nest_service(
            "/",
            ServeDir::new("public").append_index_html_on_directories(true),
        )
        .route("/api/news", get(get_news))
        .layer(cors);

    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    println!("Server listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn get_news() -> Json<NewsResponse> {
    let url = "https://www.corriere.it";
    let mut news_list = Vec::new();

    // Fetch the HTML content
    // In a real app, you'd handle errors better than unwrap/expect
    let response = match reqwest::get(url).await {
        Ok(resp) => match resp.text().await {
            Ok(text) => text,
            Err(_) => {
                return Json(NewsResponse {
                    scraped_at: Utc::now(),
                    news: vec![],
                })
            }
        },
        Err(_) => {
            return Json(NewsResponse {
                scraped_at: Utc::now(),
                news: vec![],
            })
        }
    };

    let document = Html::parse_document(&response);

    // Selectors
    let article_selector = Selector::parse(".bck-media-news").unwrap();
    let title_selector = Selector::parse("h4.title-art-hp").unwrap();
    let link_selector = Selector::parse("a").unwrap();
    let summary_selector = Selector::parse("p[class^='subtitle']").unwrap();
    let img_selector = Selector::parse("img.is_full_image").unwrap();
    let body_hp_selector = Selector::parse(".body-hp").unwrap();

    if let Some(section) = document.select(&body_hp_selector).next() {
        for element in section.select(&article_selector) {
            // Extract Title and Link
            let (title, link) = if let Some(title_element) = element.select(&title_selector).next()
            {
                let text = title_element
                    .text()
                    .collect::<Vec<_>>()
                    .join(" ")
                    .trim()
                    .to_string();
                let mut href = title_element
                    .select(&link_selector)
                    .next()
                    .and_then(|a| a.value().attr("href"))
                    .unwrap_or("")
                    .to_string();
                // Normalize to absolute URL if needed
                if !href.starts_with("http") && !href.is_empty() {
                    href = format!("https://www.corriere.it{}", href);
                }
                (text, href)
            } else {
                continue;
            };

            // Extract Description and Image
            let mut description = String::new();
            let mut image_url = None;

            if let Some(summary) = element.select(&summary_selector).next() {
                description = summary
                    .text()
                    .collect::<Vec<_>>()
                    .join(" ")
                    .trim()
                    .to_string();
            }

            if let Some(img) = element.select(&img_selector).next() {
                // Try data-src first (lazy loading), then src
                if let Some(src) = img
                    .value()
                    .attr("data-src")
                    .or_else(|| img.value().attr("src"))
                {
                    let mut url = src.to_string();
                    if !url.starts_with("http") {
                        url = format!("https://www.corriere.it{}", url);
                    }
                    image_url = Some(url);
                }
                // Fallback description from alt if empty
                if description.is_empty() {
                    if let Some(alt) = img.value().attr("alt") {
                        description = alt.to_string();
                    }
                }
            }

            if !title.is_empty() {
                news_list.push(NewsItem {
                    title,
                    description,
                    link,
                    image_url,
                });
            }

            if news_list.len() >= 20 {
                break;
            }
        }
    }

    Json(NewsResponse {
        scraped_at: Utc::now(),
        news: news_list,
    })
}
