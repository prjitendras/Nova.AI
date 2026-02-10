"""
Pytest Configuration and Fixtures

This file contains shared fixtures and configuration for all tests.
"""

import pytest
from typing import Generator

# Add common fixtures here as the project grows
# Example:
# 
# @pytest.fixture
# def test_db():
#     """Provide a test database connection."""
#     # Setup test database
#     yield db_connection
#     # Cleanup

# @pytest.fixture
# def sample_workflow():
#     """Provide a sample workflow for testing."""
#     return {
#         "workflow_id": "test-workflow-1",
#         "name": "Test Workflow",
#         ...
#     }

# @pytest.fixture
# def mock_actor():
#     """Provide a mock actor context."""
#     from app.domain.models import ActorContext
#     return ActorContext(
#         aad_id="test-aad-id",
#         email="test@example.com",
#         display_name="Test User",
#         roles=["user"]
#     )

