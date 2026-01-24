from flask import Flask, render_template, request, jsonify
from PyPDF2 import PdfReader
from google import genai 
import os
from dotenv import load_dotenv
load_dotenv()
app = Flask(__name__)

client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))

stored_pdf_text = ""

def extract_text_from_pdf(file):
    reader = PdfReader(file)
    text = ""
    for page in reader.pages:
        text += page.extract_text() or ""
    return text

@app.route('/')
def home():
    return render_template("home.html")

@app.route('/upload', methods=['POST'])
def upload():
    global stored_pdf_text
    try:
        pdf = request.files.get('ads')
        if not pdf:
            return jsonify({"error": "No file uploaded"}), 400

        stored_pdf_text = extract_text_from_pdf(pdf)
        return jsonify({"message": "PDF uploaded successfully. Ready to summarize."})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/summarize', methods=['GET'])
def summarize():
    global stored_pdf_text
    
    if not stored_pdf_text:
        return jsonify({"error": "No PDF text found. Please upload a file first."}), 400

    try:
        prompt = f"Summarize the following PDF content concisely:\n{stored_pdf_text}"
        
        # --- 2. NEW SYNTAX: Use client.models.generate_content ---
        # "gemini-2.0-flash" is experimental. "gemini-1.5-flash" is the stable one.
        response = client.models.generate_content(
            model="gemini-2.5-flash", 
            contents=prompt
        )
        
        return jsonify({"summary": response.text})
    except Exception as e:
        print(f"Gemini Error: {e}")
        return jsonify({"error": f"AI Error: {str(e)}"}), 500

if __name__ == "__main__":
    app.run(debug=True)