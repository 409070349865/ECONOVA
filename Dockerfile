FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt psycopg[binary]==3.2.6
COPY backend /app/backend
COPY economic_engine /app/economic_engine
COPY forecasting /app/forecasting
COPY simulation /app/simulation
COPY ai_engine /app/ai_engine
COPY reports /app/reports
COPY scripts /app/scripts
ENV PYTHONPATH=/app/backend:/app
EXPOSE 8000
CMD ["uvicorn","app.main:app","--host","0.0.0.0","--port","8000"]
