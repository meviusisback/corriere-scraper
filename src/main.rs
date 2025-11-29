use axum::http::{HeaderName, HeaderValue, Method};
use axum::{routing::get, Json, Router};
use chrono::{DateTime, Utc};
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
    error: Option<String>,
}

// Helper function to fetch and parse HTML
async fn fetch_html(url: &str) -> Result<String, String> {
    match reqwest::get(url).await {
        Ok(resp) => match resp.text().await {
            Ok(text) => Ok(text),
            Err(e) => Err(format!("Failed to read response text: {}", e)),
        },
        Err(e) => Err(format!("Failed to fetch URL: {}", e)),
    }
}

// Helper function to create CSS selectors
fn create_selectors() -> Result<(Selector, Selector, Selector, Selector, Selector, Selector), String>
{
    let article_selector = Selector::parse(".bck-media-news")
        .map_err(|e| format!("Failed to parse article selector: {}", e))?;
    let title_selector = Selector::parse("h4.title-art-hp")
        .map_err(|e| format!("Failed to parse title selector: {}", e))?;
    let link_selector =
        Selector::parse("a").map_err(|e| format!("Failed to parse link selector: {}", e))?;
    let summary_selector = Selector::parse("p[class^='subtitle']")
        .map_err(|e| format!("Failed to parse summary selector: {}", e))?;
    let img_selector = Selector::parse("img.is_full_image")
        .map_err(|e| format!("Failed to parse image selector: {}", e))?;
    let body_hp_selector =
        Selector::parse(".body-hp").map_err(|e| format!("Failed to parse body selector: {}", e))?;

    Ok((
        article_selector,
        title_selector,
        link_selector,
        summary_selector,
        img_selector,
        body_hp_selector,
    ))
}

// Helper function to extract news item from an element
fn extract_news_item(
    element: scraper::ElementRef,
    title_selector: &Selector,
    link_selector: &Selector,
    summary_selector: &Selector,
    img_selector: &Selector,
) -> Option<NewsItem> {
    // Extract Title and Link
    let (title, link) = if let Some(title_element) = element.select(title_selector).next() {
        let text = title_element
            .text()
            .collect::<Vec<_>>()
            .join(" ")
            .trim()
            .to_string();
        let mut href = title_element
            .select(link_selector)
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
        return None;
    };

    // Extract Description and Image
    let mut description = String::new();
    let mut image_url = None;

    if let Some(summary) = element.select(summary_selector).next() {
        description = summary
            .text()
            .collect::<Vec<_>>()
            .join(" ")
            .trim()
            .to_string();
    }

    if let Some(img) = element.select(img_selector).next() {
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

    Some(NewsItem {
        title,
        description,
        link,
        image_url,
    })
}

#[tokio::main]
async fn main() {
    // Enable CORS with specific allowed origins and methods
    let cors = CorsLayer::new()
        .allow_origin("http://localhost:3000".parse::<HeaderValue>().unwrap())
        .allow_methods(vec![Method::GET, Method::POST, Method::PUT, Method::DELETE])
        .allow_headers([
            HeaderName::from_static("authorization"),
            HeaderName::from_static("content-type"),
        ]);

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
    let response = match fetch_html(url).await {
        Ok(text) => text,
        Err(error_message) => {
            return Json(NewsResponse {
                scraped_at: Utc::now(),
                news: vec![],
                error: Some(error_message),
            })
        }
    };

    // Parse the HTML document
    let document = Html::parse_document(&response);

    // Create CSS selectors
    let selectors = match create_selectors() {
        Ok(s) => s,
        Err(error_message) => {
            return Json(NewsResponse {
                scraped_at: Utc::now(),
                news: vec![],
                error: Some(error_message),
            })
        }
    };

    let (
        article_selector,
        title_selector,
        link_selector,
        summary_selector,
        img_selector,
        body_hp_selector,
    ) = selectors;

    // Extract news items
    if let Some(section) = document.select(&body_hp_selector).next() {
        for element in section.select(&article_selector) {
            if let Some(news_item) = extract_news_item(
                element,
                &title_selector,
                &link_selector,
                &summary_selector,
                &img_selector,
            ) {
                news_list.push(news_item);

                if news_list.len() >= 20 {
                    break;
                }
            }
        }
    }

    Json(NewsResponse {
        scraped_at: Utc::now(),
        news: news_list,
        error: None,
    })
}
