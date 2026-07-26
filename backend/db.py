from sqlalchemy import create_engine, Column, String, DateTime, Integer
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime

DATABASE_URL = "sqlite:///./dispatch_didi.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

class Order(Base):
    __tablename__ = "orders"
    order_id = Column(String, primary_key=True)
    customer_name = Column(String)
    address = Column(String)
    phone = Column(String)
    eta = Column(String)

class ExceptionRecord(Base):
    __tablename__ = "exceptions"
    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(String)
    reason = Column(String)
    status = Column(String) # "resolved_autonomously" or "escalated"
    action_taken = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

def init_db():
    Base.metadata.create_all(engine)
    db = SessionLocal()
    if db.query(Order).count() == 0:
        db.add_all([
            Order(order_id="ORD1042", customer_name="Ramesh", address="12 MG Road", phone="98xxxxxx01", eta="15 min"),
            Order(order_id="ORD1043", customer_name="Priya", address="4th Cross, Indiranagar", phone="98xxxxxx02", eta="10 min"),
        ])
        db.commit()
    db.close()

if __name__ == "__main__":
    init_db()
    print("Database initialized and seeded.")