import os
import uuid
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
cred = credentials.Certificate("firebase-credentials.json")
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


simple_llm = ChatGoogleGenerativeAI(model="gemini-3.5-flash")
@app.post("/upload")
async def upload_file(file: UploadFile = File(...), uid: str = Depends(get_current_user)):
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

        # SAVE THE FILE WITH THE USER'S ID
        data = {
            "filename": file.filename,
            "owner_id": uid,  # <--- Ownership assigned here
            "cloudinary_url": upload_result.get("secure_url"),
            "cloudinary_id": upload_result.get("public_id"),
            "content": extracted_text,
            "summary": None,
            "created_at": datetime.now(timezone.utc)
        }
        result = await records.insert_one(data)

        return {"id": str(result.inserted_id), "message": "File stored successfully"}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/history")
async def get_upload_history(uid: str = Depends(get_current_user)):
    try:
        # ONLY FETCH FILES OWNED BY THIS USER
        cursor = records.find({"owner_id": uid}, {"filename": 1, "_id": 1}).sort("created_at", -1).limit(20)
        history = [{"id": str(doc["_id"]), "filename": doc["filename"]} async for doc in cursor]
        return history
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch history: {str(e)}")

# @app.get("/summarize/{doc_id}")
# async def summarize_document(doc_id: str, uid: str = Depends(get_current_user)):
#     try:
#         object_id = ObjectId(doc_id)
#         # VERIFY OWNERSHIP BEFORE SUMMARIZING
#         doc = await records.find_one({"_id": object_id, "owner_id": uid})
#         if not doc:
#             raise HTTPException(status_code=404, detail="Document not found or unauthorized")

#         if doc.get("summary"):
#             return {"summary": doc["summary"], "cached": True}

#         inputs = {"messages": [HumanMessage(content=f"Summarize this:\n{doc['content']}")]}
#         response = graph.invoke(inputs)
#         final_summary = response["messages"][-1].content

#         await records.update_one({"_id": object_id}, {"$set": {"summary": final_summary}})
#         return {"summary": final_summary, "cached": False}
#     except Exception as e:
#         traceback.print_exc()
#         raise HTTPException(status_code=500, detail=str(e))
    

@app.get("/summarize/{doc_id}")
async def summarize_document(doc_id: str, uid: str = Depends(get_current_user)):
    try:
        object_id = ObjectId(doc_id)
        # VERIFY OWNERSHIP BEFORE SUMMARIZING
        doc = await records.find_one({"_id": object_id, "owner_id": uid})
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found or unauthorized")

        # RETURN CACHED SUMMARY IF IT EXISTS
        if doc.get("summary"):
            return {"summary": doc["summary"], "cached": True}

        # =================================================================
        # OPTION 1: Simple API Call (CURRENTLY ACTIVE)
        # =================================================================
        prompt = f"Please write a clear, well-structured, and comprehensive summary of the following document:\n\n{doc['content']}"
        
        # Calling your Gemini 3.5 Flash model
        response = simple_llm.invoke(prompt)
        
        # STRICT STRING EXTRACTION (Fixes the [object Object] error)
        raw_content = response.content
        if isinstance(raw_content, list):
            # If the AI returns a list of blocks, extract just the text
            final_summary = "\n".join([block.get("text", "") for block in raw_content if isinstance(block, dict)])
        elif isinstance(raw_content, dict):
            # If it returns a dictionary, grab the text key
            final_summary = raw_content.get("text", str(raw_content))
        else:
            # If it is already a string, keep it as is
            final_summary = str(raw_content)

        # =================================================================
        # OPTION 2: LangGraph Reflexion Agent (COMMENTED OUT FOR LATER)
        # =================================================================
        # inputs = {"messages": [HumanMessage(content=f"Summarize this:\n{doc['content']}")]}
        # response = graph.invoke(inputs)
        # final_summary = response["messages"][-1].content
        # =================================================================

        # SAVE TO MONGODB
        await records.update_one({"_id": object_id}, {"$set": {"summary": final_summary}})
        return {"summary": final_summary, "cached": False}
        
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    
         
@app.delete("/history/{doc_id}")
async def delete_document(doc_id: str, uid: str = Depends(get_current_user)):
    try:
        # VERIFY OWNERSHIP BEFORE DELETING
        result = await records.delete_one({"_id": ObjectId(doc_id), "owner_id": uid})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Document not found or unauthorized")
        return {"message": "Document successfully deleted"}
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid ID")

@app.post("/documents/{doc_id}/comments")
async def add_comment(doc_id: str, payload: dict, uid: str = Depends(get_current_user)):
    comment_text = payload.get("text", "").strip()
    if not comment_text: raise HTTPException(status_code=400, detail="Comment cannot be empty")

    new_comment = {"id": uuid.uuid4().hex, "text": comment_text, "created_at": datetime.now(timezone.utc)}
    
    # VERIFY OWNERSHIP BEFORE ADDING COMMENT
    result = await records.update_one(
        {"_id": ObjectId(doc_id), "owner_id": uid},
        {"$push": {"comments": new_comment}}
    )
    if result.matched_count == 0: raise HTTPException(status_code=404, detail="Document not found or unauthorized")
    return {"message": "Comment added successfully", "comment": new_comment}

@app.get("/documents/{doc_id}/comments")
async def get_comments(doc_id: str, uid: str = Depends(get_current_user)):
    doc = await records.find_one({"_id": ObjectId(doc_id), "owner_id": uid}, {"comments": 1})
    if not doc: raise HTTPException(status_code=404, detail="Document not found or unauthorized")
    return doc.get("comments") or []

@app.put("/documents/{doc_id}/comments/{comment_id}")
async def edit_comment(doc_id: str, comment_id: str, payload: dict, uid: str = Depends(get_current_user)):
    new_text = payload.get("text", "").strip()
    result = await records.update_one(
        {"_id": ObjectId(doc_id), "owner_id": uid, "comments.id": comment_id},
        {"$set": {"comments.$.text": new_text}}
    )
    if result.matched_count == 0: raise HTTPException(status_code=404, detail="Comment not found or unauthorized")
    return {"message": "Comment updated successfully"}

@app.delete("/documents/{doc_id}/comments/{comment_id}")
async def delete_comment(doc_id: str, comment_id: str, uid: str = Depends(get_current_user)):
    result = await records.update_one(
        {"_id": ObjectId(doc_id), "owner_id": uid},
        {"$pull": {"comments": {"id": comment_id}}}
    )
    if result.matched_count == 0: raise HTTPException(status_code=404, detail="Comment not found or unauthorized")
    return {"message": "Comment deleted successfully"}

@app.post("/documents/{doc_id}/ask")
async def ask_document_question(doc_id: str, payload: dict, uid: str = Depends(get_current_user)):
    question = payload.get("question", "").strip()
    if not question: raise HTTPException(status_code=400, detail="Question cannot be empty")

    # VERIFY OWNERSHIP BEFORE CHATTING
    doc = await records.find_one({"_id": ObjectId(doc_id), "owner_id": uid}, {"content": 1})
    if not doc or not doc.get("content"):
        raise HTTPException(status_code=404, detail="Document not found or unauthorized")

    try:
        response = qa_chain.invoke({"context": doc["content"], "question": question})
        return {"answer": response.content}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))