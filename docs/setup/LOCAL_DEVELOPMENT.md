# Local Development Setup Guide

## Prerequisites
- **Node.js**: v20.x or v22/v24+ (LTS recommended)
- **npm**: v10+
- **Python 3** (Optional): Required only if running local OpenAI Whisper transcription (`scripts/transcribe_audio.py`) or scikit-learn model retraining (`scripts/train_model.py`).
- **PostgreSQL 15+** (Optional): Automatically falls back to the local JSON file store (`src/data/app_database.json`) if PostgreSQL is not running.

---

## Step-by-Step Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```
2. **Configure Environment Variables**:
   ```bash
   cp .env.example .env
   ```
3. **Start the Development Server (Express + Vite HMR)**:
   ```bash
   npm run dev
   ```
   The application will start at `http://localhost:3000`.
4. **Run Type Checking, Tests & Production Build**:
   ```bash
   npm run lint
   npm test
   npm run build
   ```
