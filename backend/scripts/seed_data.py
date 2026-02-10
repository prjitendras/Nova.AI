"""
Seed Data Script - Creates sample workflow for testing
Run: python -m scripts.seed_data
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime
from app.repositories.mongo_client import get_collection, create_indexes
from app.domain.models import WorkflowTemplate, WorkflowVersion, WorkflowDefinition
from app.domain.enums import WorkflowStatus
from app.utils.idgen import generate_workflow_id, generate_workflow_version_id


def create_sample_workflow():
    """Create a sample Employee Onboarding workflow"""
    
    workflows_col = get_collection("workflow_templates")
    versions_col = get_collection("workflow_versions")
    
    # Check if already seeded
    if workflows_col.count_documents({}) > 0:
        print("Database already has data. Skipping seed.")
        return
    
    now = datetime.utcnow()
    workflow_id = generate_workflow_id()
    version_id = generate_workflow_version_id()
    
    # Sample workflow definition
    definition = {
        "steps": [
            {
                "step_id": "step_form_1",
                "step_name": "Request Details",
                "step_type": "FORM_STEP",
                "order": 1,
                "is_start": True,
                "description": "Fill in the onboarding request details",
                "fields": [
                    {
                        "field_key": "employee_name",
                        "field_label": "New Employee Name",
                        "field_type": "TEXT",
                        "required": True,
                        "placeholder": "Enter full name"
                    },
                    {
                        "field_key": "start_date",
                        "field_label": "Start Date",
                        "field_type": "DATE",
                        "required": True
                    },
                    {
                        "field_key": "department",
                        "field_label": "Department",
                        "field_type": "SELECT",
                        "required": True,
                        "options": ["Engineering", "HR", "Finance", "Marketing", "Sales", "Operations"]
                    },
                    {
                        "field_key": "equipment_needed",
                        "field_label": "Equipment Needed",
                        "field_type": "TEXTAREA",
                        "required": False,
                        "placeholder": "List any specific equipment requirements"
                    }
                ],
                "sla": {"due_minutes": 1440}  # 24 hours
            },
            {
                "step_id": "step_approval_1",
                "step_name": "Manager Approval",
                "step_type": "APPROVAL_STEP",
                "order": 2,
                "description": "Manager reviews and approves the onboarding request",
                "approver_resolution": "REQUESTER_MANAGER",
                "sla": {"due_minutes": 2880}  # 48 hours
            },
            {
                "step_id": "step_task_1",
                "step_name": "IT Setup",
                "step_type": "TASK_STEP",
                "order": 3,
                "description": "IT team sets up accounts and equipment",
                "instructions": "1. Create AD account\n2. Setup email\n3. Prepare laptop\n4. Configure VPN access",
                "execution_notes_required": True,
                "sla": {"due_minutes": 4320}  # 72 hours
            },
            {
                "step_id": "step_task_2",
                "step_name": "HR Documentation",
                "step_type": "TASK_STEP",
                "order": 4,
                "description": "HR completes onboarding documentation",
                "instructions": "1. Prepare employment contract\n2. Setup payroll\n3. Create employee record\n4. Schedule orientation",
                "execution_notes_required": True,
                "is_terminal": True,
                "sla": {"due_minutes": 2880}  # 48 hours
            }
        ],
        "transitions": [
            {
                "from_step_id": "step_form_1",
                "event": "SUBMIT_FORM",
                "to_step_id": "step_approval_1"
            },
            {
                "from_step_id": "step_approval_1",
                "event": "APPROVE",
                "to_step_id": "step_task_1"
            },
            {
                "from_step_id": "step_approval_1",
                "event": "REJECT",
                "to_step_id": None  # Terminal - rejected
            },
            {
                "from_step_id": "step_task_1",
                "event": "COMPLETE_TASK",
                "to_step_id": "step_task_2"
            },
            {
                "from_step_id": "step_task_2",
                "event": "COMPLETE_TASK",
                "to_step_id": None  # Terminal - completed
            }
        ],
        "start_step_id": "step_form_1"
    }
    
    # Create workflow template
    workflow_doc = {
        "_id": workflow_id,
        "workflow_id": workflow_id,
        "name": "Employee Onboarding",
        "description": "Standard employee onboarding process including manager approval, IT setup, and HR documentation.",
        "category": "HR",
        "tags": ["onboarding", "hr", "new-hire"],
        "status": WorkflowStatus.PUBLISHED.value,
        "definition": definition,
        "published_version": 1,
        "created_by": {
            "email": "admin@company.com",
            "display_name": "System Admin"
        },
        "created_at": now,
        "updated_at": now,
        "version": 1
    }
    
    workflows_col.insert_one(workflow_doc)
    print(f"Created workflow: {workflow_id}")
    
    # Create published version
    version_doc = {
        "_id": version_id,
        "workflow_version_id": version_id,
        "workflow_id": workflow_id,
        "version_number": 1,
        "name": "Employee Onboarding",
        "description": "Standard employee onboarding process including manager approval, IT setup, and HR documentation.",
        "category": "HR",
        "tags": ["onboarding", "hr", "new-hire"],
        "definition": definition,
        "published_by": {
            "email": "admin@company.com",
            "display_name": "System Admin"
        },
        "published_at": now
    }
    
    versions_col.insert_one(version_doc)
    print(f"Created workflow version: {version_id}")
    
    # Create a second sample workflow
    workflow_id_2 = generate_workflow_id()
    version_id_2 = generate_workflow_version_id()
    
    definition_2 = {
        "steps": [
            {
                "step_id": "step_request",
                "step_name": "Access Request Details",
                "step_type": "FORM_STEP",
                "order": 1,
                "is_start": True,
                "description": "Specify the system access you need",
                "fields": [
                    {
                        "field_key": "system_name",
                        "field_label": "System Name",
                        "field_type": "SELECT",
                        "required": True,
                        "options": ["CRM", "ERP", "HR Portal", "Finance System", "Dev Environment"]
                    },
                    {
                        "field_key": "access_level",
                        "field_label": "Access Level",
                        "field_type": "SELECT",
                        "required": True,
                        "options": ["Read Only", "Read/Write", "Admin"]
                    },
                    {
                        "field_key": "justification",
                        "field_label": "Business Justification",
                        "field_type": "TEXTAREA",
                        "required": True,
                        "placeholder": "Explain why you need this access"
                    }
                ],
                "sla": {"due_minutes": 480}  # 8 hours
            },
            {
                "step_id": "step_manager_approval",
                "step_name": "Manager Approval",
                "step_type": "APPROVAL_STEP",
                "order": 2,
                "description": "Manager approves the access request",
                "approver_resolution": "REQUESTER_MANAGER",
                "sla": {"due_minutes": 1440}  # 24 hours
            },
            {
                "step_id": "step_provision",
                "step_name": "Provision Access",
                "step_type": "TASK_STEP",
                "order": 3,
                "description": "IT provisions the requested access",
                "instructions": "1. Verify approval\n2. Create/modify account\n3. Grant permissions\n4. Notify user",
                "execution_notes_required": True,
                "is_terminal": True,
                "sla": {"due_minutes": 480}  # 8 hours
            }
        ],
        "transitions": [
            {
                "from_step_id": "step_request",
                "event": "SUBMIT_FORM",
                "to_step_id": "step_manager_approval"
            },
            {
                "from_step_id": "step_manager_approval",
                "event": "APPROVE",
                "to_step_id": "step_provision"
            },
            {
                "from_step_id": "step_manager_approval",
                "event": "REJECT",
                "to_step_id": None
            },
            {
                "from_step_id": "step_provision",
                "event": "COMPLETE_TASK",
                "to_step_id": None
            }
        ],
        "start_step_id": "step_request"
    }
    
    workflow_doc_2 = {
        "_id": workflow_id_2,
        "workflow_id": workflow_id_2,
        "name": "System Access Request",
        "description": "Request access to company systems with manager approval.",
        "category": "IT",
        "tags": ["access", "it", "security"],
        "status": WorkflowStatus.PUBLISHED.value,
        "definition": definition_2,
        "published_version": 1,
        "created_by": {
            "email": "admin@company.com",
            "display_name": "System Admin"
        },
        "created_at": now,
        "updated_at": now,
        "version": 1
    }
    
    workflows_col.insert_one(workflow_doc_2)
    print(f"Created workflow: {workflow_id_2}")
    
    version_doc_2 = {
        "_id": version_id_2,
        "workflow_version_id": version_id_2,
        "workflow_id": workflow_id_2,
        "version_number": 1,
        "name": "System Access Request",
        "description": "Request access to company systems with manager approval.",
        "category": "IT",
        "tags": ["access", "it", "security"],
        "definition": definition_2,
        "published_by": {
            "email": "admin@company.com",
            "display_name": "System Admin"
        },
        "published_at": now
    }
    
    versions_col.insert_one(version_doc_2)
    print(f"Created workflow version: {version_id_2}")
    
    print("\n[OK] Seed data created successfully!")
    print("   - 2 sample workflows published and ready for testing")


def main():
    print("=== Seeding database ===")
    print("-" * 40)
    
    # Create indexes first
    create_indexes()
    
    # Create sample data
    create_sample_workflow()
    
    print("-" * 40)
    print("Done!")


if __name__ == "__main__":
    main()

