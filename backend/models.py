from sqlalchemy import (
    Column, Integer, String, Float, Boolean,
    DateTime, Text, JSON, ForeignKey
)
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class Exam(Base):
    __tablename__ = "exams"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    base_url = Column(String, nullable=False)
    total_questions = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    questions = relationship("Question", back_populates="exam", cascade="all, delete-orphan")
    sessions = relationship("ExamSession", back_populates="exam", cascade="all, delete-orphan")


class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    exam_id = Column(Integer, ForeignKey("exams.id"))
    question_number = Column(Integer)
    url = Column(String, nullable=True)
    question_text = Column(Text, nullable=False)
    # {"A": "text", "B": "text", "C": "text", "D": "text"}
    options = Column(JSON, nullable=False)
    correct_answer = Column(String, nullable=False)  # "A", "B", "C" or "D"
    topic = Column(String, nullable=True, default="General")
    exam_question_id = Column(Integer, nullable=True)  # data-id do ExamTopics (para buscar comentários via AJAX)
    # [{"username": "...", "selected_answer": "D", "text": "..."}]
    comments = Column(JSON, nullable=True, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)

    exam = relationship("Exam", back_populates="questions")
    answers = relationship("SessionAnswer", back_populates="question")


class ExamSession(Base):
    __tablename__ = "exam_sessions"

    id = Column(Integer, primary_key=True, index=True)
    exam_id = Column(Integer, ForeignKey("exams.id"))
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    score = Column(Float, nullable=True)
    total_questions = Column(Integer, default=65)

    exam = relationship("Exam", back_populates="sessions")
    answers = relationship("SessionAnswer", back_populates="session", cascade="all, delete-orphan")


class SessionAnswer(Base):
    __tablename__ = "session_answers"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("exam_sessions.id"))
    question_id = Column(Integer, ForeignKey("questions.id"))
    user_answer = Column(String, nullable=False)
    is_correct = Column(Boolean, nullable=False)

    session = relationship("ExamSession", back_populates="answers")
    question = relationship("Question", back_populates="answers")
