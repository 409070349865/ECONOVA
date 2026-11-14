FROM node:22-alpine AS frontend-build
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY backend /app/backend
COPY economic_engine /app/economic_engine
COPY forecasting /app/forecasting
COPY simulation /app/simulation
COPY ai_engine /app/ai_engine
COPY reports /app/reports
COPY scripts /app/scripts
COPY --from=frontend-build /frontend/dist /app/frontend/dist
ENV PYTHONPATH=/app/backend:/app
ENV PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["uvicorn","app.main:app","--host","0.0.0.0","--port","8000"]
