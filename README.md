# Study Hub — CertFarm

Plataforma de estudos para certificações (AWS, GCP, Azure, HashiCorp).

## Arquitetura atual (local)

```
study-hub/
├── backend/      FastAPI + SQLite (roda local)
└── frontend/     Next.js 14 (roda local, porta 3000)
```

O backend roda em `localhost:8000` e o frontend proxia `/api/*` para ele via `next.config.mjs`.

---

## Próximo passo: deploy simplificado

### Objetivo

| Peça | Onde roda |
|------|-----------|
| Banco de dados | **Neon** (PostgreSQL gratuito, serverless) |
| API + Frontend | **Vercel** (Next.js API routes, serverless) |
| Scraper | **Local** (conecta direto no Neon via `DATABASE_URL`) |

Elimina o servidor FastAPI em produção. Tudo no Vercel, banco no Neon.

### O que precisa ser feito

1. **Criar banco no Neon**
   - Acessar [neon.tech](https://neon.tech) → criar projeto → copiar `DATABASE_URL`

2. **Migrar FastAPI → Next.js API routes**
   - Endpoints atuais em `backend/main.py` viram `frontend/app/api/*/route.ts`
   - SQLAlchemy/SQLite → `@neondatabase/serverless` (PostgreSQL)
   - Rotas a migrar:
     - `GET/POST /api/exams`
     - `DELETE /api/exams/{id}`
     - `GET/DELETE /api/questions`
     - `POST /api/sessions` · `GET /api/sessions` · `GET /api/sessions/{id}/results`
     - `POST /api/admin/verify`
     - `GET/POST/DELETE /api/settings/cookies`

3. **Atualizar o scraper**
   - Trocar SQLite → conexão direta no Neon via `DATABASE_URL` env var
   - Scraper continua rodando local, mas escreve no banco remoto

4. **Deploy**
   - Vercel: conectar repo → root directory `frontend` → add env `DATABASE_URL`
   - Neon: já fica público por padrão

### Variáveis de ambiente necessárias (Vercel)

```
DATABASE_URL=postgresql://...   # connection string do Neon
ADMIN_PASSWORD=sua_senha        # senha do painel admin
```

### Variáveis locais (scraper)

Criar `backend/.env`:
```
DATABASE_URL=postgresql://...   # mesma URL do Neon
ADMIN_PASSWORD=sua_senha
```

---

## Como rodar local (situação atual)

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
# sobe em http://localhost:8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# sobe em http://localhost:3000
```

### Admin

Acesse `http://localhost:3000/admin` → senha padrão: `certfarm2024`

---

## Funcionalidades

- **Provas** (`/certifications`) — catálogo de exames disponíveis
- **Modo Estudo** (`/study`) — sessões aleatórias ou sequenciais, escolha a partir de qual questão começar, progresso salvo no localStorage
- **Dashboard** (`/dashboard`) — histórico de sessões, revisar questões erradas/certas
- **Admin** (`/admin`) — importar provas via scraping do ExamTopics (senha protegido)
- **Configurações** (`/settings`) — colar cookies do ExamTopics para liberar questões premium
