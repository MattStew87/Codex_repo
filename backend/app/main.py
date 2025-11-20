from __future__ import annotations

from flask import Flask, jsonify


app = Flask(__name__)


@app.get("/")
def read_root():
    """Return a friendly greeting for the API root."""
    return jsonify({"message": "Hello from the Python backend!"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)
