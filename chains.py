from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_google_genai import ChatGoogleGenerativeAI
llm = ChatGoogleGenerativeAI(model="gemini-2.0-flash")
generation_prompt = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            "You are an expert summarization assistant.\n"
            "Your task is to generate a clear, concise, and structured summary of the given content.\n\n"
            "Guidelines:\n"
            "- Capture the main ideas and key insights.\n"
            "- Remove redundancy and unimportant details.\n"
            "- Maintain factual accuracy.\n"
            "- Use simple and clear language.\n"
            "- Structure output properly.\n\n"
            "Output Format:\n"
            "1. 1–2 line overview\n"
            "2. Bullet points of key ideas\n\n"
            "If the user provides feedback, improve the previous summary accordingly."
        ),
        MessagesPlaceholder(variable_name="messages"),
    ]
)

reflection_prompt = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            "You are an expert editor and reviewer.\n"
            "Your job is to critically evaluate the given summary and suggest improvements.\n\n"
            "Focus on:\n"
            "- Missing key points\n"
            "- Clarity and readability\n"
            "- Structure and formatting\n"
            "- Conciseness\n"
            "- Accuracy\n\n"
            "Provide:\n"
            "1. Specific critique\n"
            "2. Concrete suggestions for improvement\n"
            "3. If needed, suggest better structure or wording"
        ),
        MessagesPlaceholder(variable_name="messages"),
    ]
)


generate_chain = generation_prompt | llm
reflect_chain = reflection_prompt | llm