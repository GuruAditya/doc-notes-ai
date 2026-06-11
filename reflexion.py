import time
from typing import TypedDict, Annotated
from dotenv import load_dotenv

load_dotenv()

from langchain_core.messages import BaseMessage, HumanMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langgraph.types import RetryPolicy

from chains import generate_chain, reflect_chain,qa_chain

class MessageGraph(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]

REFLECT = "reflect"
GENERATE = "generate"

def generation_node(state: MessageGraph):
    time.sleep(2) 
    return {"messages": [generate_chain.invoke({"messages": state["messages"]})]}

def reflection_node(state: MessageGraph):
    time.sleep(2)
    res = reflect_chain.invoke({"messages": state["messages"]})
    return {"messages": [HumanMessage(content=res.content)]}

builder = StateGraph(state_schema=MessageGraph)

api_retry_policy = RetryPolicy(
    initial_interval=10.0,   
    backoff_factor=2.0,      
    max_interval=120.0,      
    max_attempts=5,          
    retry_on=Exception       
)

builder.add_node(GENERATE, generation_node, retry_policy=api_retry_policy)
builder.add_node(REFLECT, reflection_node, retry_policy=api_retry_policy)
builder.set_entry_point(GENERATE)

def should_continue(state: MessageGraph):
    if len(state["messages"]) >= 4:
        return END
    return REFLECT

builder.add_conditional_edges(GENERATE, should_continue)
builder.add_edge(REFLECT, GENERATE)

graph = builder.compile()

if __name__ == "__main__":
    print("\n--- Mermaid Graph Definition ---")
    print(graph.get_graph().draw_mermaid())
    
    print("\n--- ASCII Graph Visualization ---")
    graph.get_graph().print_ascii()