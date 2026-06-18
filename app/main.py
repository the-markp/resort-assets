from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging
import uvicorn

from app.database import init_tables
from app.routers import assets, categories, dashboard, auth, users, incidents, settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await init_tables()
    except Exception:
        logger.exception("STARTUP FAILED — could not initialise database tables")
        raise
    yield


app = FastAPI(
    title="G-Tracker Asset Management",
    description="Resort hotel asset tracking system",
    version="3.0.1",
    lifespan=lifespan,
)

# ── Trust X-Forwarded-Proto / X-Forwarded-Host from the reverse proxy (Caddy/Nginx) ───
# Without this, Starlette's automatic trailing-slash redirects use the scheme the app
# sees internally (http://, since the proxy connects to it over plain HTTP on localhost)
# instead of the scheme the browser actually used (https://). The browser then blocks
# the redirected request as mixed content. ProxyHeadersMiddleware fixes this by reading
# X-Forwarded-Proto and rewriting the request scope's "scheme" accordingly.
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware  # noqa: E402

app.add_middleware(ProxyHeadersMiddleware, trusted_hosts="*")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,      prefix="/api/auth",      tags=["Auth"])
app.include_router(users.router,     prefix="/api/users",     tags=["Users"])
app.include_router(assets.router,    prefix="/api/assets",    tags=["Assets"])
app.include_router(categories.router,prefix="/api/categories",tags=["Categories"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(incidents.router, prefix="/api/incidents", tags=["Incidents"])
app.include_router(settings.router,  prefix="/api/settings",  tags=["Settings"])

app.mount("/static", StaticFiles(directory="frontend/static"), name="static")


@app.get("/", response_class=HTMLResponse)
async def root():
    with open("frontend/templates/index.html", "r") as f:
        return f.read()


if __name__ == "__main__":
    # proxy_headers + forwarded_allow_ips tell Uvicorn to trust X-Forwarded-* headers
    # from the upstream proxy. Safe here since the app is only reachable via that proxy.
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        proxy_headers=True,
        forwarded_allow_ips="*",
    )
