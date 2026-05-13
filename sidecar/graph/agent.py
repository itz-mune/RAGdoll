"""LangGraph-based chat agent for RAGdoll."""
from typing import Annotated, TypedDict
import operator

from langgraph.graph import StateGraph, START, END
from langchain_core.messages import BaseMessage


# ── State ────────────────────────────────────────────────────────────────────

class ChatState(TypedDict):
    """Mutable state threaded through every graph node."""
    messages: Annotated[list[BaseMessage], operator.add]


# ── LLM factory ──────────────────────────────────────────────────────────────

def get_llm(provider: str, api_key: str, model: str | None = None):
    """Return a configured LangChain chat model for the given provider."""
    provider = provider.lower()

    if provider == "openai":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(api_key=api_key, model=model or "gpt-4o", streaming=True)

    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            api_key=api_key,
            model=model or "claude-3-5-sonnet-20241022",
            streaming=True,
        )

    if provider == "groq":
        from langchain_groq import ChatGroq
        return ChatGroq(api_key=api_key, model=model or "llama-3.3-70b-versatile")

    if provider == "google":
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(
            google_api_key=api_key,
            model=model or "gemini-2.0-flash",
        )

    if provider == "huggingface":
        if not model:
            raise ValueError("Model ID required for HuggingFace")
        from langchain_huggingface import HuggingFaceEndpoint
        return HuggingFaceEndpoint(
            repo_id=model,
            huggingfacehub_api_token=api_key,
            task="text-generation",
        )

    if provider == "openrouter":
        if not model:
            raise ValueError("Model slug required for OpenRouter")
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            api_key=api_key,
            model=model,
            base_url="https://openrouter.ai/api/v1",
            streaming=True,
            default_headers={
                "HTTP-Referer": "https://github.com/ragdoll-app/ragdoll",
                "X-Title": "RAGdoll",
            },
        )

    if provider == "ollama":
        from langchain_ollama import ChatOllama
        return ChatOllama(base_url=api_key, model=model or "mistral")

    raise ValueError(f"Unknown provider: {provider!r}")


# ── Graph factory ─────────────────────────────────────────────────────────────

def build_chat_graph(provider: str, api_key: str, model: str | None = None):
    """
    Build and compile a minimal LangGraph for a single LLM call.

    Graph topology:
        START → llm_node → END

    The node MUST be async so that LangChain's callback system fires
    on_chat_model_stream events inside astream_events().  Calling the
    synchronous llm.invoke() from a thread-pool context breaks the async
    callback propagation and results in zero stream events being emitted.

    Future extensions (retriever, tools) slot in as additional nodes here.
    """
    llm = get_llm(provider, api_key, model)

    async def llm_node(state: ChatState) -> dict:
        response = await llm.ainvoke(state["messages"])
        return {"messages": [response]}

    builder: StateGraph = StateGraph(ChatState)
    builder.add_node("llm", llm_node)
    builder.add_edge(START, "llm")
    builder.add_edge("llm", END)

    return builder.compile()
