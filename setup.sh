#!/usr/bin/env bash
set -e

echo "=== Study Hub — Setup ==="

# ── Backend ──────────────────────────────────────────────────────────────────
echo ""
echo "→ Configurando backend Python..."
cd "$(dirname "$0")/backend"

if ! command -v python3 &>/dev/null; then
  echo "ERRO: python3 não encontrado. Instale Python 3.11+."
  exit 1
fi

python3 -m venv .venv
source .venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt

echo "✓ Backend pronto."

# ── Frontend ──────────────────────────────────────────────────────────────────
echo ""
echo "→ Configurando frontend Node..."
cd ../frontend

if ! command -v node &>/dev/null; then
  echo "ERRO: node não encontrado. Instale Node.js 18+."
  exit 1
fi

npm install --silent
echo "✓ Frontend pronto."

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════"
echo " Setup concluído!"
echo ""
echo " Para iniciar:"
echo "   Backend:  cd backend && source .venv/bin/activate && uvicorn main:app --reload"
echo "   Frontend: cd frontend && npm run dev"
echo ""
echo " Acesse: http://localhost:5173"
echo "════════════════════════════════════════"
