import os
import cloudinary
import cloudinary.uploader
from fastapi import FastAPI, UploadFile, File, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from bson.errors import InvalidId
from dotenv import load_dotenv
from langchain_core.messages import HumanMessage
from PyPDF2 import PdfReader
from io import BytesIO
from datetime import datetime, timezone
from pathlib import Path
import traceback

from reflexion import graph
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

load_dotenv()

app = FastAPI()

BASE_DIR = Path(__file__).parent.resolve()

app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")

@app.get("/")
async def serve_home():
    return FileResponse(BASE_DIR / "templates" / "home.html")

cloudinary.config(
  cloud_name = "dxxggltcm",
  api_key = "932744274871862",
  api_secret = "zk-6Jmiq9SKRn9UnpcCbol3c2n0",
  secure = True
)

client = AsyncIOMotorClient(os.getenv("MONGODB_URL"))
db = client.pdf_assistant
records = db.summaries

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        file_bytes = await file.read()

        reader = PdfReader(BytesIO(file_bytes))
        extracted_text = "".join([page.extract_text() or "" for page in reader.pages])

        upload_result = cloudinary.uploader.upload(
            file_bytes,
            resource_type="raw",
            folder="pdf_summarizer/",
            public_id=file.filename
        )

        pdf_url = upload_result.get("secure_url")

        data = {
            "filename": file.filename,
            "cloudinary_url": pdf_url,
            "cloudinary_id": upload_result.get("public_id"),
            "content": extracted_text,
            "summary": None,
            "created_at": datetime.now(timezone.utc)
        }
        result = await records.insert_one(data)

        return {
            "id": str(result.inserted_id),
            "url": pdf_url,
            "message": "File stored in Cloudinary and metadata in MongoDB"
        }
    except Exception as e:
        traceback.print_exc()  # prints full error in terminal
        raise HTTPException(status_code=500, detail=str(e))

# ================= NEW: HISTORY ENDPOINT =================
@app.get("/history")
async def get_upload_history():
    try:
        # Fetch records, sort by newest 'created_at', limit to last 20 documents
        cursor = records.find({}, {"filename": 1, "_id": 1}).sort("created_at", -1).limit(20)
        history = []
        
        async for doc in cursor:
            history.append({
                "id": str(doc["_id"]),
                "filename": doc["filename"]
            })
            
        return history
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to fetch history: {str(e)}")
# =========================================================

@app.get("/summarize/{doc_id}")
async def summarize_document(doc_id: str):
    # Validate ObjectId format before querying
    try:
        object_id = ObjectId(doc_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail=f"Invalid document ID format: {doc_id}")

    doc = await records.find_one({"_id": object_id})
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document not found for id: {doc_id}")

    if doc.get("summary"):
        return {"summary": doc["summary"], "cached": True}

    try:
        inputs = {"messages": [HumanMessage(content=f"Summarize this:\n{doc['content']}")]}
        response = graph.invoke(inputs)
        final_summary = response["messages"][-1].content

        await records.update_one(
            {"_id": object_id},
            {"$set": {"summary": final_summary}}
        )

        return {"summary": final_summary, "cached": False}
    except Exception as e:
        traceback.print_exc()  # prints full error in terminal
        raise HTTPException(status_code=500, detail=str(e))  # now shows real error in browser too
    

# ================= NEW: DELETE HISTORY ENTRY ENDPOINT =================
@app.delete("/history/{doc_id}")
async def delete_document(doc_id: str):
    try:
        # Validate ObjectId format before querying
        object_id = ObjectId(doc_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail=f"Invalid document ID format: {doc_id}")

    # Delete the document from the MongoDB collection
    result = await records.delete_one({"_id": object_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail=f"Document not found or already deleted.")
        
    return {"message": "Document successfully deleted from database"}
# ======================================================================

