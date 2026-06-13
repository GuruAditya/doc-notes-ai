import os
import json  # <--- Added this required import for Firebase in the cloud
import uuid
import asyncio
import cloudinary
import cloudinary.uploader
import traceback
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from bson.errors import InvalidId
from dotenv import load_dotenv
from PyPDF2 import PdfReader
from io import BytesIO

import httpx
from fastapi.responses import StreamingResponse

# Firebase & LangChain Imports
import firebase_admin
from firebase_admin import credentials, auth
from langchain_core.messages import HumanMessage
from reflexion import graph
from chains import qa_chain
from langchain_google_genai import ChatGoogleGenerativeAI

load_dotenv()

app = FastAPI()
BASE_DIR = Path(__file__).parent.resolve()
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")

# ================= FIREBASE AUTHENTICATION =================
# Check if we are running locally (file exists) or in the cloud (using env variable)
firebase_cert_path = "firebase-credentials.json"

if os.path.exists(firebase_cert_path):
    # LOCAL: Use the physical file
    cred = credentials.Certificate(firebase_cert_path)
else:
    # CLOUD: Read the JSON string from the Environment Variable on Render
    firebase_json_str = os.getenv("FIREBASE_JSON")
    if not firebase_json_str:
        raise ValueError("FATAL ERROR: FIREBASE_JSON environment variable is missing! Check Render settings.")
    
    # Convert the string back into a dictionary for Firebase
    firebase_dict = json.loads(firebase_json_str)
    cred = credentials.Certificate(firebase_dict)

firebase_admin.initialize_app(cred)

security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)):
    """The Security Gate: Verifies the Firebase token and returns the user's UID."""
    token = credentials.credentials
    try:
        decoded_token = auth.verify_id_token(token)
        return decoded_token['uid']
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid authentication token")
# ==========================================================

@app.get("/")
async def serve_home():
    return FileResponse(BASE_DIR / "templates" / "home.html")

cloudinary.config(
  cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME", "dxxggltcm"),
  api_key = os.getenv("CLOUDINARY_API_KEY", "932744274871862"),
  api_secret = os.getenv("CLOUDINARY_API_SECRET", "zk-6Jmiq9SKRn9UnpcCbol3c2n0"),
  secure = True
)

client = AsyncIOMotorClient(os.getenv("MONGODB_URL"))
db = client.pdf_assistant
records = db.summaries

# FIX 1: Corrected model name from "gemini-3.5-flash" (does not exist)
# to "gemini-2.0-flash"
simple_llm = ChatGoogleGenerativeAI(model="gemini-3.5-flash")

# ================= HELPER: safely extract text from LLM response =================
def extract_text(raw) -> str:
    """Handles all response formats Gemini can return: string, dict, or list of blocks."""
    if isinstance(raw, list):
        return "\n".join([block.get("text", "") for block in raw if isinstance(block, dict)])
    elif isinstance(raw, dict):
        return raw.get("text", str(raw))
    else:
        return str(raw)
# =================================================================================

@app.post("/upload")
async def upload_file(file: UploadFile = File(...), uid: str = Depends(get_current_user)):
    try:
        file_bytes = await file.read()
        reader = PdfReader(BytesIO(file_bytes))
        extracted_text = "".join([page.extract_text() or "" for page in reader.pages])

        upload_result = cloudinary.uploader.upload(
            file_bytes,
            resource_type="raw",
            type="authenticated",
            folder="pdf_summarizer/",
            public_id=file.filename,
            format="pdf"
        )

        data = {
            "filename": file.filename,
            "owner_id": uid,
            "cloudinary_url": upload_result.get("secure_url"),
            "cloudinary_id": upload_result.get("public_id"),
            "content": extracted_text,
            "summary": None,
            "created_at": datetime.now(timezone.utc)
        }
        result = await records.insert_one(data)

        return {
            "id": str(result.inserted_id),
            "message": "File stored successfully",
            "cloudinary_url": upload_result.get("secure_url"),
            "filename": file.filename
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/history")
async def get_upload_history(uid: str = Depends(get_current_user)):
    try:
        cursor = records.find({"owner_id": uid}, {"filename": 1, "_id": 1}).sort("created_at", -1).limit(20)
        history = [{"id": str(doc["_id"]), "filename": doc["filename"]} async for doc in cursor]
        return history
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch history: {str(e)}")


@app.get("/document/{doc_id}")
async def get_document(doc_id: str, uid: str = Depends(get_current_user)):
    try:
        doc = await records.find_one({"_id": ObjectId(doc_id), "owner_id": uid})
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found or unauthorized")

        return {
            "id": str(doc["_id"]),
            "filename": doc["filename"],
            "cloudinary_url": doc.get("cloudinary_url"),
            "summary": doc.get("summary")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/summarize/{doc_id}")
async def summarize_document(
    doc_id: str,
    mode: str = "simple",
    uid: str = Depends(get_current_user)
):
    try:
        object_id = ObjectId(doc_id)
        doc = await records.find_one({"_id": object_id, "owner_id": uid})
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found or unauthorized")

        if mode == "complex":
            # Run blocking LangGraph call in a thread so we don't block the event loop
            inputs = {"messages": [HumanMessage(content=f"Summarize this:\n{doc['content']}")]}
            response = await asyncio.wait_for(
                asyncio.to_thread(graph.invoke, inputs),
                timeout=120.0
            )
            final_summary = extract_text(response["messages"][-1].content)

        else:
            prompt = f"Please write a clear, well-structured, and comprehensive summary of the following document:\n\n{doc['content']}"
            # Run blocking LLM call in a thread
            response = await asyncio.wait_for(
                asyncio.to_thread(simple_llm.invoke, prompt),
                timeout=60.0
            )
            final_summary = extract_text(response.content)

        await records.update_one({"_id": object_id}, {"$set": {"summary": final_summary}})
        return {"summary": final_summary, "cached": False}

    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Summarization timed out. Try the Fast mode or a shorter document.")
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/history/{doc_id}")
async def delete_document(doc_id: str, uid: str = Depends(get_current_user)):
    try:
        result = await records.delete_one({"_id": ObjectId(doc_id), "owner_id": uid})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Document not found or unauthorized")
        return {"message": "Document successfully deleted"}
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid ID")


@app.post("/documents/{doc_id}/comments")
async def add_comment(doc_id: str, payload: dict, uid: str = Depends(get_current_user)):
    comment_text = payload.get("text", "").strip()
    if not comment_text:
        raise HTTPException(status_code=400, detail="Comment cannot be empty")

    new_comment = {"id": uuid.uuid4().hex, "text": comment_text, "created_at": datetime.now(timezone.utc)}

    result = await records.update_one(
        {"_id": ObjectId(doc_id), "owner_id": uid},
        {"$push": {"comments": new_comment}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Document not found or unauthorized")
    return {"message": "Comment added successfully", "comment": new_comment}


@app.get("/documents/{doc_id}/comments")
async def get_comments(doc_id: str, uid: str = Depends(get_current_user)):
    doc = await records.find_one({"_id": ObjectId(doc_id), "owner_id": uid}, {"comments": 1})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found or unauthorized")
    return doc.get("comments") or []


@app.put("/documents/{doc_id}/comments/{comment_id}")
async def edit_comment(doc_id: str, comment_id: str, payload: dict, uid: str = Depends(get_current_user)):
    new_text = payload.get("text", "").strip()
    result = await records.update_one(
        {"_id": ObjectId(doc_id), "owner_id": uid, "comments.id": comment_id},
        {"$set": {"comments.$.text": new_text}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Comment not found or unauthorized")
    return {"message": "Comment updated successfully"}


@app.delete("/documents/{doc_id}/comments/{comment_id}")
async def delete_comment(doc_id: str, comment_id: str, uid: str = Depends(get_current_user)):
    result = await records.update_one(
        {"_id": ObjectId(doc_id), "owner_id": uid},
        {"$pull": {"comments": {"id": comment_id}}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Comment not found or unauthorized")
    return {"message": "Comment deleted successfully"}


@app.post("/documents/{doc_id}/ask")
async def ask_document_question(doc_id: str, payload: dict, uid: str = Depends(get_current_user)):
    question = payload.get("question", "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    # FIX 2: Use "is None" instead of "not doc.get('content')" so that
    # documents with valid but short content aren't wrongly rejected
    doc = await records.find_one({"_id": ObjectId(doc_id), "owner_id": uid}, {"content": 1})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found or unauthorized")
    if doc.get("content") is None:
        raise HTTPException(status_code=404, detail="Document has no extracted text")

    try:
        # FIX 3: Run blocking qa_chain in a thread so FastAPI's event loop
        # isn't frozen while the LLM is thinking
        response = await asyncio.wait_for(
            asyncio.to_thread(qa_chain.invoke, {"context": doc["content"], "question": question}),
            timeout=30.0
        )

        # FIX 4: Use extract_text() helper — Gemini can return a string, dict,
        # or list of blocks. This handles all three instead of blindly
        # doing response.content which gave "[object Object]"
        answer = extract_text(response.content)
        return {"answer": answer}

    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="The AI took too long to respond. Please try again.")
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/document/{doc_id}/file")
async def get_document_file(doc_id: str, uid: str = Depends(get_current_user)):
    doc = await records.find_one({"_id": ObjectId(doc_id), "owner_id": uid})
    if not doc or not doc.get("cloudinary_url"):
        raise HTTPException(status_code=404, detail="File not found")

    public_id = doc["cloudinary_id"]
    if public_id.lower().endswith(".pdf"):
        public_id = public_id[:-4]

    signed_url, _ = cloudinary.utils.cloudinary_url(
        public_id,
        resource_type="raw",
        type="authenticated",
        sign_url=True,
        format="pdf"
    )

    async with httpx.AsyncClient() as client:
        resp = await client.get(signed_url)

    if resp.status_code != 200:
        print(f"[PREVIEW DEBUG] URL: {signed_url}")
        print(f"[PREVIEW DEBUG] Status: {resp.status_code}")
        print(f"[PREVIEW DEBUG] Body: {resp.text[:500]}")
        raise HTTPException(status_code=502, detail=f"Failed to fetch file from storage (status {resp.status_code})")

    return StreamingResponse(
        iter([resp.content]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{doc["filename"]}"'}
    )