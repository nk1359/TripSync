from flask import Flask, send_from_directory, jsonify
import os

app = Flask(__name__, static_folder='build', static_url_path='')

@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

# Example API endpoint (optional)
@app.route('/api/hello', methods=['GET'])
def hello():
    return jsonify({"message": "Hello from Flask!"})

# Catch-all route for client-side routing (e.g., /register, /home, etc.)
@app.route('/<path:path>')
def serve_react_app(path):
    if not os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, 'index.html')
    return send_from_directory(app.static_folder, path)


if __name__ == '__main__':
    app.run(debug=True)
