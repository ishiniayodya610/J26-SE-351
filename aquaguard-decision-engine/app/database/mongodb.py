"""
MongoDB database connection client using PyMongo.
"""

import os
from pymongo import MongoClient

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "aquaguard_db")

_client = None


def get_mongo_client() -> MongoClient:
    """
    Get or initialize the MongoDB client instance.
    """
    global _client
    if _client is None:
        _client = MongoClient(MONGO_URI)
    return _client


def get_database():
    """
    Get the AquaGuard database handle.
    """
    client = get_mongo_client()
    return client[DATABASE_NAME]
