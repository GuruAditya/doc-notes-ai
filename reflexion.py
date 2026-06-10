import time
from typing import TypedDict, Annotated
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

from langchain_core.messages import BaseMessage, HumanMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages

# The correct, official import location in modern LangGraph
from langgraph.types import RetryPolicy

# Import your configured chains
from chains import generate_chain, reflect_chain


# 1. Define State Schema
class MessageGraph(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]


# Constants for node names
REFLECT = "reflect"
GENERATE = "generate"


# 2. Define Nodes with rate-limit safety buffers
def generation_node(state: MessageGraph):
    # Short artificial pause to lower burst RPM on Gemini's free tier
    time.sleep(2) 
    return {"messages": [generate_chain.invoke({"messages": state["messages"]})]}


def reflection_node(state: MessageGraph):
    # Short artificial pause between rapid iterative calls
    time.sleep(2)
    res = reflect_chain.invoke({"messages": state["messages"]})
    return {"messages": [HumanMessage(content=res.content)]}


# 3. Initialize State Graph
builder = StateGraph(state_schema=MessageGraph)


# 4. Define the formal RetryPolicy Object
api_retry_policy = RetryPolicy(
    initial_interval=10.0,   # Start by waiting 10 seconds
    backoff_factor=2.0,      
    max_interval=120.0,      # Give it up to 2 minutes to cool down (this covers the 52s requirement)
    max_attempts=5,          
    retry_on=Exception       
)


# 5. Add Nodes passing the proper object structure
# Note: The correct parameter name is "retry_policy"
builder.add_node(GENERATE, generation_node, retry_policy=api_retry_policy)
builder.add_node(REFLECT, reflection_node, retry_policy=api_retry_policy)
builder.set_entry_point(GENERATE)


# 6. Define Routing/Conditional Logic
def should_continue(state: MessageGraph):
    if len(state["messages"]) >= 4:
        return END
    return REFLECT


# 7. Map Graph Relationships
builder.add_conditional_edges(GENERATE, should_continue)
builder.add_edge(REFLECT, GENERATE)


# 8. Compile Graph
graph = builder.compile()


# 9. Print Visualizations to Terminal when executed directly
if __name__ == "__main__":
    print("\n--- Mermaid Graph Definition ---")
    print(graph.get_graph().draw_mermaid())
    
    print("\n--- ASCII Graph Visualization ---")
    graph.get_graph().print_ascii()