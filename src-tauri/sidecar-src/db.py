"""SQLite database setup using SQLModel for RAGdoll chat."""
from typing import Optional

from sqlmodel import SQLModel, Field, Session, create_engine


DATABASE_URL = "sqlite:///./ragdoll_chat.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


class ConversationModel(SQLModel, table=True):
    """Conversation database model."""

    __tablename__ = "conversations"  # type: ignore[assignment]

    id: str = Field(primary_key=True)
    title: str
    provider: str
    model: str
    created_at: int  # Unix timestamp ms
    updated_at: int  # Unix timestamp ms
    message_count: int = 0


class MessageModel(SQLModel, table=True):
    """Message database model."""

    __tablename__ = "messages"  # type: ignore[assignment]

    id: str = Field(primary_key=True)
    conversation_id: str = Field(foreign_key="conversations.id")
    role: str  # 'user' | 'assistant' | 'system'
    content: str
    created_at: int  # Unix timestamp ms
    memory_chunks: Optional[str] = Field(default=None)  # JSON string
    citations: Optional[str] = Field(default=None)       # JSON array string
    display_content: Optional[str] = Field(default=None)
    attached_file_names: Optional[str] = Field(default=None)  # JSON array string
    tool_calls_made: Optional[str] = Field(default=None)      # JSON array string
    tokens_used: Optional[int] = Field(default=None)          # prompt+completion tokens
    response_time_ms: Optional[int] = Field(default=None)     # wall-clock ms for this response


class ConversationSummary(SQLModel, table=True):
    """LLM-generated summary of a compacted conversation."""

    __tablename__ = "conversation_summaries"  # type: ignore[assignment]

    id: str = Field(primary_key=True)
    conversation_id: str = Field(index=True)
    summary_text: str
    chunk_count_summarized: int = 0
    created_at: int = 0  # Unix timestamp ms


def init_db() -> None:
    """Create all tables on startup if they don't exist."""
    SQLModel.metadata.create_all(engine)

    # Safe schema migrations — try to add new columns; ignore if already present.
    from sqlalchemy import text
    with Session(engine) as session:
        for stmt in [
            "ALTER TABLE messages ADD COLUMN citations TEXT",
            "ALTER TABLE messages ADD COLUMN display_content TEXT",
            "ALTER TABLE messages ADD COLUMN attached_file_names TEXT",
            "ALTER TABLE messages ADD COLUMN tool_calls_made TEXT",
            "ALTER TABLE messages ADD COLUMN tokens_used INTEGER",
            "ALTER TABLE messages ADD COLUMN response_time_ms INTEGER",
        ]:
            try:
                session.exec(text(stmt))
                session.commit()
            except Exception:
                pass  # column already exists


def get_db():
    """FastAPI dependency — yields a SQLModel Session."""
    with Session(engine) as session:
        yield session
