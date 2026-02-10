"""GenAI Service - AI-powered workflow generation with comprehensive feature support"""
import json
import uuid
from typing import Any, Dict, List, Optional
from openai import AzureOpenAI

from ..domain.models import ActorContext
from ..domain.errors import OpenAIError, ValidationError
from ..config.settings import settings
from ..utils.logger import get_logger

logger = get_logger(__name__)


class GenAIService:
    """Service for AI-powered workflow generation with full feature support"""
    
    def __init__(self):
        self.client: Optional[AzureOpenAI] = None
        if settings.azure_openai_endpoint and settings.azure_openai_api_key:
            self.client = AzureOpenAI(
                azure_endpoint=settings.azure_openai_endpoint,
                api_key=settings.azure_openai_api_key,
                api_version=settings.azure_openai_api_version
            )
    
    def _get_system_prompt(self) -> str:
        """Get comprehensive system prompt for workflow generation with ALL features"""
        return """You are an expert enterprise workflow designer for AIOPS Workflow Platform. Generate VALID JSON workflow definitions that support complex business processes with advanced features.

## STEP TYPES (use exactly these values):

### 1. FORM_STEP - Collect data from users
```json
{
  "step_id": "step_1",
  "step_name": "Request Details",
  "step_type": "FORM_STEP",
  "description": "Collect initial request information",
  "is_start": true,
  "order": 0,
  "fields": [...],
  "sections": [...]
}
```

### 2. APPROVAL_STEP - Get approval from managers/approvers
```json
{
  "step_id": "step_2",
  "step_name": "Manager Approval",
  "step_type": "APPROVAL_STEP",
  "order": 1,
  "approver_resolution": "REQUESTER_MANAGER",
  "allow_reassign": true
}
```
**Approver Resolution Options:**
- "REQUESTER_MANAGER": Route to requester's manager (most common)
- "SPECIFIC_EMAIL": Route to a specific person (add specific_approver_email, optionally specific_approver_display_name)
- "SPOC_EMAIL": Route to a Single Point of Contact (add spoc_email)
- "CONDITIONAL": Route based on form field values (add conditional_approver_rules)
- "STEP_ASSIGNEE": Route to assignee of a previous task step (add step_assignee_step_id)

**For Parallel Approvals (multiple approvers must approve):**
```json
{
  "step_type": "APPROVAL_STEP",
  "approver_resolution": "SPECIFIC_EMAIL",
  "parallel_approval": "ALL",
  "parallel_approvers": ["approver1@company.com", "approver2@company.com"],
  "primary_approver_email": "approver1@company.com"
}
```

**For Conditional Approvals:**
```json
{
  "approver_resolution": "CONDITIONAL",
  "conditional_approver_rules": [
    {
      "field_key": "department",
      "operator": "EQUALS",
      "value": "Finance",
      "approver_email": "finance.manager@company.com",
      "approver_display_name": "Finance Manager"
    }
  ],
  "conditional_fallback_approver": "default.approver@company.com"
}
```

### 3. TASK_STEP - Agent work/execution step
```json
{
  "step_id": "step_3",
  "step_name": "Process Request",
  "step_type": "TASK_STEP",
  "order": 2,
  "instructions": "Detailed instructions for the agent",
  "execution_notes_required": true,
  "fields": [...],
  "sections": [...]
}
```

**For Tasks with Linked Repeating Data (repeat agent form based on earlier repeating section):**
```json
{
  "step_type": "TASK_STEP",
  "fields": [...],
  "linked_repeating_source": {
    "source_step_id": "step_1",
    "source_section_id": "section_locations",
    "context_field_keys": ["field_location_name", "field_country"]
  }
}
```

**For Tasks with Output Fields (agent provides structured output):**
```json
{
  "step_type": "TASK_STEP",
  "instructions": "Review and process",
  "output_fields": [
    {"field_key": "resolution_code", "field_label": "Resolution Code", "field_type": "SELECT", "required": true, "options": ["Resolved", "Escalated", "Rejected"]}
  ]
}
```

### 4. NOTIFY_STEP - Send notification (usually terminal step)
```json
{
  "step_id": "step_4",
  "step_name": "Completion Notification",
  "step_type": "NOTIFY_STEP",
  "is_terminal": true,
  "order": 3,
  "notification_template": "TICKET_COMPLETED",
  "recipients": ["requester", "approvers", "assigned_agent"],
  "auto_advance": true
}
```
**Notification Templates:**
- "TICKET_CREATED", "APPROVAL_PENDING", "APPROVED", "REJECTED"
- "TASK_ASSIGNED", "TASK_COMPLETED", "INFO_REQUESTED", "INFO_RESPONDED"
- "TICKET_COMPLETED", "TICKET_CANCELLED", "SLA_REMINDER", "SLA_ESCALATION"

### 5. FORK_STEP - Split into parallel branches
```json
{
  "step_id": "step_fork",
  "step_name": "Parallel Processing",
  "step_type": "FORK_STEP",
  "order": 4,
  "branches": [
    {
      "branch_id": "branch_1",
      "branch_name": "IT Review",
      "description": "IT team reviews the request",
      "assigned_team": "IT Department",
      "start_step_id": "step_it_approval",
      "color": "#3b82f6"
    },
    {
      "branch_id": "branch_2",
      "branch_name": "Finance Review",
      "assigned_team": "Finance Team",
      "start_step_id": "step_finance_approval",
      "color": "#10b981"
    }
  ],
  "failure_policy": "CONTINUE_OTHERS"
}
```
**Failure Policy Options:**
- "FAIL_ALL": If any branch fails, entire workflow fails
- "CONTINUE_OTHERS": Other branches continue even if one fails
- "CANCEL_OTHERS": Cancel other branches if one fails

### 6. JOIN_STEP - Wait for parallel branches to complete
```json
{
  "step_id": "step_join",
  "step_name": "Consolidate Reviews",
  "step_type": "JOIN_STEP",
  "order": 10,
  "join_mode": "ALL",
  "source_fork_step_id": "step_fork"
}
```
**Join Mode Options:**
- "ALL": Wait for all branches to complete
- "ANY": Continue when any one branch completes
- "MAJORITY": Continue when majority of branches complete

### 7. SUB_WORKFLOW_STEP - Embed a reusable published workflow
```json
{
  "step_id": "step_sub",
  "step_name": "Standard Onboarding Process",
  "step_type": "SUB_WORKFLOW_STEP",
  "order": 3,
  "sub_workflow_id": "WF-abc123",
  "sub_workflow_version": 1,
  "sub_workflow_name": "IT Onboarding"
}
```
Note: Sub-workflows run as part of the same ticket. Requester and manager remain the same.

---

## FORM FIELD FORMAT:
```json
{
  "field_key": "unique_snake_case_key",
  "field_label": "Human Readable Label",
  "field_type": "TEXT",
  "required": true,
  "order": 0,
  "placeholder": "Enter value here",
  "help_text": "Additional guidance for the user",
  "section_id": "section_1",
  "validation": {
    "min_length": 10,
    "max_length": 500,
    "min_value": 0,
    "max_value": 100,
    "regex_pattern": "^[A-Z]{2}[0-9]{4}$",
    "date_validation": {
      "allow_past_dates": false,
      "allow_today": true,
      "allow_future_dates": true
    }
  }
}
```

## FIELD TYPES:
- **TEXT**: Single line text input
- **TEXTAREA**: Multi-line text (descriptions, notes, comments)
- **NUMBER**: Numeric input (add validation.min_value/max_value)
- **DATE**: Date picker (add date_validation for past/today/future restrictions)
- **SELECT**: Dropdown with single selection (MUST include "options" array)
- **MULTISELECT**: Multiple selection chips (MUST include "options" array)
- **CHECKBOX**: Yes/No toggle (boolean)
- **FILE**: File attachment upload
- **USER_SELECT**: Searchable user selector (searches organization users via Azure AD)

---

## DATE VALIDATION (for DATE fields):
Control which dates users can select:
```json
{
  "field_key": "start_date",
  "field_label": "Start Date",
  "field_type": "DATE",
  "required": true,
  "validation": {
    "date_validation": {
      "allow_past_dates": false,
      "allow_today": true,
      "allow_future_dates": true
    }
  }
}
```
- `allow_past_dates`: Can user select dates before today?
- `allow_today`: Can user select today's date?
- `allow_future_dates`: Can user select dates after today?

---

## CONDITIONAL FIELD VISIBILITY (show/hide fields based on other field values):
```json
{
  "field_key": "manager_name",
  "field_label": "Manager Name",
  "field_type": "USER_SELECT",
  "conditional_visibility": {
    "field": "needs_manager_approval",
    "operator": "EQUALS",
    "value": true
  }
}
```

---

## CONDITIONAL REQUIREMENTS (make fields required/optional based on conditions):

### Single Condition:
```json
{
  "field_key": "budget_amount",
  "field_label": "Budget Amount",
  "field_type": "NUMBER",
  "required": false,
  "conditional_requirements": [
    {
      "rule_id": "rule_1",
      "when": {
        "field_key": "request_type",
        "operator": "equals",
        "value": "Budget Request"
      },
      "then": {
        "required": true
      }
    }
  ]
}
```

### Compound Conditions (AND/OR logic):
```json
{
  "field_key": "approval_document",
  "field_label": "Approval Document",
  "field_type": "FILE",
  "required": false,
  "conditional_requirements": [
    {
      "rule_id": "rule_1",
      "when": {
        "field_key": "department",
        "operator": "equals",
        "value": "Finance",
        "logic": "AND",
        "conditions": [
          {
            "field_key": "amount",
            "operator": "greater_than",
            "value": 10000
          }
        ]
      },
      "then": {
        "required": true
      }
    }
  ]
}
```

### Conditional Date Validation (change date rules based on dropdown):
```json
{
  "field_key": "effective_date",
  "field_label": "Effective Date",
  "field_type": "DATE",
  "required": true,
  "conditional_requirements": [
    {
      "rule_id": "rule_backdate",
      "when": {
        "field_key": "request_type",
        "operator": "equals",
        "value": "Backdated Entry"
      },
      "then": {
        "required": true,
        "date_validation": {
          "allow_past_dates": true,
          "allow_today": true,
          "allow_future_dates": false
        }
      }
    },
    {
      "rule_id": "rule_future",
      "when": {
        "field_key": "request_type",
        "operator": "equals",
        "value": "Future Scheduled"
      },
      "then": {
        "required": true,
        "date_validation": {
          "allow_past_dates": false,
          "allow_today": false,
          "allow_future_dates": true
        }
      }
    }
  ]
}
```

**Condition Operators:**
- "equals", "not_equals": Exact match
- "in", "not_in": Value in array
- "is_empty", "is_not_empty": Check if field has value
- "greater_than", "less_than", "greater_than_or_equals", "less_than_or_equals": Numeric comparison
- "contains", "not_contains": String contains

---

## FORM SECTIONS (organize fields into groups):
```json
{
  "sections": [
    {
      "section_id": "section_basic",
      "section_title": "Basic Information",
      "section_description": "Enter basic details",
      "order": 0,
      "is_repeating": false
    },
    {
      "section_id": "section_locations",
      "section_title": "Delivery Locations",
      "section_description": "Add one or more delivery locations",
      "order": 1,
      "is_repeating": true,
      "min_rows": 1
    }
  ]
}
```

### Repeating Sections:
- `is_repeating: true` allows users to add multiple rows (like line items)
- `min_rows`: Minimum required rows (e.g., `1` means at least one row mandatory)
- Fields in repeating sections can be linked to TASK_STEP via `linked_repeating_source`

---

## SELECT/MULTISELECT Example:
```json
{
  "field_key": "priority",
  "field_label": "Priority Level",
  "field_type": "SELECT",
  "required": true,
  "options": ["Low", "Medium", "High", "Critical"]
}
```

---

## SLA CONFIGURATION (optional - for time-sensitive steps):
```json
{
  "sla": {
    "due_minutes": 1440,
    "reminders": [
      {"minutes_before_due": 60, "recipients": ["assigned_to"]}
    ],
    "escalations": [
      {"minutes_after_due": 30, "recipients": ["manager"]}
    ]
  }
}
```

---

## TRANSITION FORMAT:
```json
{
  "transition_id": "t_1",
  "from_step_id": "step_1",
  "to_step_id": "step_2",
  "on_event": "SUBMIT_FORM",
  "priority": 0
}
```

**CONDITIONAL TRANSITIONS (for branching based on form values):**
```json
{
  "transition_id": "t_conditional",
  "from_step_id": "step_form",
  "to_step_id": "step_high_value",
  "on_event": "SUBMIT_FORM",
  "priority": 1,
  "condition": {
    "logic": "AND",
    "conditions": [
      {"field": "amount", "operator": "GREATER_THAN", "value": 10000},
      {"field": "department", "operator": "EQUALS", "value": "Finance"}
    ]
  }
}
```

**CONDITION OPERATORS (MUST be UPPERCASE):**
- EQUALS, NOT_EQUALS
- GREATER_THAN, LESS_THAN, GREATER_THAN_OR_EQUALS, LESS_THAN_OR_EQUALS
- CONTAINS, NOT_CONTAINS
- IN, NOT_IN
- IS_EMPTY, IS_NOT_EMPTY

**IMPORTANT:** In conditions, use "field" (NOT "field_key") and operators MUST be UPPERCASE.

**TRANSITION EVENTS:**
- SUBMIT_FORM: After form submission
- APPROVE: After approval (use for APPROVAL_STEP)
- REJECT: After rejection (leads to rejection flow or terminal)
- COMPLETE_TASK: After task completion (use for TASK_STEP)

---

## BRANCH STEPS:
Steps inside a branch MUST include:
```json
{
  "branch_id": "branch_1",
  "parent_fork_step_id": "step_fork"
}
```

---

## CRITICAL RULES:
1. First step MUST have `is_start: true`
2. Last step(s) MUST have `is_terminal: true`
3. Every step needs at least one transition to/from it (except terminal)
4. APPROVAL_STEP always needs `approver_resolution`
5. TASK_STEP should have `instructions`
6. SELECT/MULTISELECT MUST have `options` array with at least 2 options
7. Branch steps MUST have `branch_id` and `parent_fork_step_id`
8. JOIN_STEP MUST have `source_fork_step_id` matching the FORK_STEP
9. DATE fields that need restrictions MUST have `validation.date_validation`
10. Repeating sections that need minimum rows MUST have `min_rows`
11. SUB_WORKFLOW_STEP requires `sub_workflow_id`, `sub_workflow_version`, `sub_workflow_name`

---

## COMPLETE EXAMPLE - Complex Multi-feature Workflow:
```json
{
  "steps": [
    {
      "step_id": "step_1",
      "step_name": "Request Form",
      "step_type": "FORM_STEP",
      "is_start": true,
      "order": 0,
      "description": "Submit your request with all required details",
      "sections": [
        {
          "section_id": "section_basic",
          "section_title": "Basic Information",
          "order": 0,
          "is_repeating": false
        },
        {
          "section_id": "section_items",
          "section_title": "Request Items",
          "section_description": "Add at least one item",
          "order": 1,
          "is_repeating": true,
          "min_rows": 1
        }
      ],
      "fields": [
        {
          "field_key": "title",
          "field_label": "Request Title",
          "field_type": "TEXT",
          "required": true,
          "order": 0,
          "placeholder": "Enter a descriptive title",
          "section_id": "section_basic",
          "validation": {"min_length": 5, "max_length": 200}
        },
        {
          "field_key": "request_type",
          "field_label": "Request Type",
          "field_type": "SELECT",
          "required": true,
          "order": 1,
          "section_id": "section_basic",
          "options": ["Standard", "Urgent", "Backdated"]
        },
        {
          "field_key": "effective_date",
          "field_label": "Effective Date",
          "field_type": "DATE",
          "required": true,
          "order": 2,
          "section_id": "section_basic",
          "validation": {
            "date_validation": {
              "allow_past_dates": false,
              "allow_today": true,
              "allow_future_dates": true
            }
          },
          "conditional_requirements": [
            {
              "rule_id": "rule_backdate",
              "when": {
                "field_key": "request_type",
                "operator": "equals",
                "value": "Backdated"
              },
              "then": {
                "required": true,
                "date_validation": {
                  "allow_past_dates": true,
                  "allow_today": true,
                  "allow_future_dates": false
                }
              }
            }
          ]
        },
        {
          "field_key": "item_name",
          "field_label": "Item Name",
          "field_type": "TEXT",
          "required": true,
          "order": 0,
          "section_id": "section_items"
        },
        {
          "field_key": "quantity",
          "field_label": "Quantity",
          "field_type": "NUMBER",
          "required": true,
          "order": 1,
          "section_id": "section_items",
          "validation": {"min_value": 1, "max_value": 1000}
        }
      ]
    },
    {
      "step_id": "step_2",
      "step_name": "Manager Approval",
      "step_type": "APPROVAL_STEP",
      "order": 1,
      "approver_resolution": "REQUESTER_MANAGER",
      "allow_reassign": true,
      "sla": {
        "due_minutes": 2880,
        "reminders": [{"minutes_before_due": 120, "recipients": ["assigned_to"]}]
      }
    },
    {
      "step_id": "step_3",
      "step_name": "Process Items",
      "step_type": "TASK_STEP",
      "order": 2,
      "instructions": "Process each item in the request. Mark each item as completed.",
      "execution_notes_required": true,
      "linked_repeating_source": {
        "source_step_id": "step_1",
        "source_section_id": "section_items",
        "context_field_keys": ["item_name", "quantity"]
      },
      "fields": [
        {
          "field_key": "status",
          "field_label": "Processing Status",
          "field_type": "SELECT",
          "required": true,
          "options": ["Completed", "Partial", "Unable to Process"]
        }
      ]
    },
    {
      "step_id": "step_4",
      "step_name": "Complete",
      "step_type": "NOTIFY_STEP",
      "is_terminal": true,
      "order": 3,
      "notification_template": "TICKET_COMPLETED",
      "recipients": ["requester", "approvers"],
      "auto_advance": true
    }
  ],
  "transitions": [
    {"transition_id": "t_1", "from_step_id": "step_1", "to_step_id": "step_2", "on_event": "SUBMIT_FORM"},
    {"transition_id": "t_2", "from_step_id": "step_2", "to_step_id": "step_3", "on_event": "APPROVE"},
    {"transition_id": "t_3", "from_step_id": "step_3", "to_step_id": "step_4", "on_event": "COMPLETE_TASK"}
  ],
  "start_step_id": "step_1"
}
```

RESPOND WITH ONLY VALID JSON. NO MARKDOWN CODE BLOCKS. NO EXPLANATION TEXT."""

    def generate_workflow_draft(
        self,
        prompt_text: str,
        constraints: Optional[Dict[str, Any]],
        examples: Optional[List[Dict[str, Any]]],
        actor: ActorContext
    ) -> Dict[str, Any]:
        """
        Generate workflow draft from natural language description
        
        Returns draft definition with validation results.
        Includes retry logic for transient failures.
        """
        if not self.client:
            # Return a default template if OpenAI not configured
            return self._generate_default_draft(prompt_text)
        
        # Build messages once (reused across retries)
        messages = [
            {"role": "system", "content": self._get_system_prompt()},
        ]
        
        # Add examples if provided
        if examples:
            for example in examples[:2]:  # Limit to 2 examples
                messages.append({
                    "role": "user",
                    "content": f"Example: {example.get('description', '')}"
                })
                messages.append({
                    "role": "assistant",
                    "content": json.dumps(example.get('definition', {}), indent=2)
                })
        
        # Build enhanced user prompt with feature hints
        user_message = f"""Create a workflow for: {prompt_text}

When generating, consider these features based on the description:
1. **Field Types**: Choose appropriate types (TEXT, TEXTAREA, NUMBER, DATE, SELECT, MULTISELECT, CHECKBOX, FILE, USER_SELECT)
2. **Sections**: Use sections to organize complex forms. Mark sections as repeating for line items/lists
3. **Repeating Sections**: If users need to add multiple items/rows, use is_repeating: true and consider min_rows for mandatory entries
4. **Date Validation**: If dates need restrictions (no past dates, future only, etc.), add date_validation
5. **Conditional Logic**: 
   - Use conditional_visibility to show/hide fields based on dropdown values
   - Use conditional_requirements for AND/OR logic to make fields required conditionally
   - Use conditional date_validation to change date rules based on field values
6. **Approvals**: Choose appropriate approver_resolution (REQUESTER_MANAGER is most common)
7. **Parallel Processing**: Use FORK/JOIN steps for independent parallel tracks
8. **Task Forms**: For TASK_STEP with embedded forms, link to repeating sections if processing line items
9. **Validation**: Add appropriate validation rules (min/max length, min/max value, regex patterns)
10. **SLA**: Add SLA configuration for time-sensitive steps"""
        
        if constraints:
            user_message += f"\n\nConstraints: {json.dumps(constraints)}"
        
        messages.append({"role": "user", "content": user_message})
        
        # Retry configuration
        max_retries = 2
        retry_delay_seconds = 2
        last_error = None
        last_raw_content = None
        
        for attempt in range(max_retries + 1):
            try:
                if attempt > 0:
                    logger.info(f"AI generation retry attempt {attempt}/{max_retries}")
                    import time
                    time.sleep(retry_delay_seconds)
                
                # Call Azure OpenAI
                response = self.client.chat.completions.create(
                    model=settings.azure_openai_deployment,
                    messages=messages,
                    temperature=0.7,
                    max_tokens=8000,  # Increased for complex workflows
                    response_format={"type": "json_object"}
                )
                
                # Parse response - add null checks for robustness
                if not response.choices or len(response.choices) == 0:
                    raise ValueError("AI returned no response choices")
                
                content = response.choices[0].message.content
                last_raw_content = content  # Store for debugging
                
                if not content or not content.strip():
                    raise ValueError("AI returned empty response")
                
                draft_definition = json.loads(content)
                
                # Validate that we have actual steps (not empty definition)
                if not draft_definition.get("steps") or len(draft_definition.get("steps", [])) == 0:
                    raise ValueError("AI returned definition without steps")
                
                # Normalize and fix any incorrect field names from AI
                draft_definition = self._normalize_definition(draft_definition)
                
                # Comprehensive validation
                validation = self._validate_draft(draft_definition)
                
                logger.info(f"AI workflow generation successful on attempt {attempt + 1}, steps: {len(draft_definition.get('steps', []))}")
                
                return {
                    "draft_definition": draft_definition,
                    "validation": validation,
                    "ai_metadata": {
                        "model": settings.azure_openai_deployment,
                        "prompt_tokens": response.usage.prompt_tokens if response.usage else 0,
                        "completion_tokens": response.usage.completion_tokens if response.usage else 0,
                        "attempts": attempt + 1
                    }
                }
                
            except json.JSONDecodeError as e:
                last_error = e
                logger.warning(f"AI generation attempt {attempt + 1} failed - JSON parse error: {e}")
                if last_raw_content:
                    # Log first 500 chars of response for debugging
                    logger.warning(f"Raw AI response (first 500 chars): {last_raw_content[:500]}")
                # Continue to retry
                
            except ValueError as e:
                last_error = e
                logger.warning(f"AI generation attempt {attempt + 1} failed - validation error: {e}")
                # Continue to retry
                
            except Exception as e:
                last_error = e
                error_str = str(e).lower()
                # Check for transient/retryable errors
                is_retryable = any(keyword in error_str for keyword in [
                    "timeout", "rate limit", "429", "503", "504", "502",
                    "connection", "temporary", "overloaded", "capacity"
                ])
                
                if is_retryable and attempt < max_retries:
                    logger.warning(f"AI generation attempt {attempt + 1} failed with retryable error: {e}")
                    continue
                else:
                    # Non-retryable error or last attempt
                    logger.error(f"AI generation failed permanently: {e}")
                    raise OpenAIError(f"Failed to generate workflow: {str(e)}")
        
        # All retries exhausted
        logger.error(f"AI generation failed after {max_retries + 1} attempts. Last error: {last_error}")
        raise OpenAIError(f"Failed to generate workflow after {max_retries + 1} attempts. Please try again.")
    
    def _normalize_definition(self, draft: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize and fix any incorrect field names from AI generation"""
        
        # Fix transitions
        transitions = draft.get("transitions", [])
        fixed_transitions = []
        
        for i, t in enumerate(transitions):
            fixed = {
                "transition_id": t.get("transition_id") or f"t_{i+1}",
                "from_step_id": t.get("from_step_id", ""),
                "to_step_id": t.get("to_step_id", ""),
                # Handle both 'on_event' and 'event' fields
                "on_event": t.get("on_event") or t.get("event", "SUBMIT_FORM"),
                "priority": t.get("priority", 0)
            }
            # Copy and normalize condition if present
            if "condition" in t and t["condition"]:
                fixed["condition"] = self._normalize_transition_condition(t["condition"])
            fixed_transitions.append(fixed)
        
        draft["transitions"] = fixed_transitions
        
        # Fix steps - normalize field names
        steps = draft.get("steps", [])
        fixed_steps = []
        
        for step in steps:
            fixed_step = {**step}
            step_type = step.get("step_type", "")
            
            # Ensure step has required fields
            if "step_id" not in fixed_step:
                fixed_step["step_id"] = f"step_{uuid.uuid4().hex[:8]}"
            if "step_name" not in fixed_step:
                fixed_step["step_name"] = f"Step {len(fixed_steps) + 1}"
            if "order" not in fixed_step:
                fixed_step["order"] = len(fixed_steps)
            
            # Normalize form fields if present
            if "fields" in step and step["fields"]:
                fixed_fields = []
                for idx, field in enumerate(step["fields"]):
                    fixed_field = self._normalize_field(field, idx)
                    fixed_fields.append(fixed_field)
                fixed_step["fields"] = fixed_fields
            
            # Normalize sections if present
            if "sections" in step and step["sections"]:
                fixed_sections = []
                for idx, section in enumerate(step["sections"]):
                    fixed_section = self._normalize_section(section, idx)
                    fixed_sections.append(fixed_section)
                fixed_step["sections"] = fixed_sections
            
            # Normalize APPROVAL_STEP specific fields
            if step_type == "APPROVAL_STEP":
                fixed_step = self._normalize_approval_step(fixed_step)
            
            # Normalize FORK_STEP specific fields
            if step_type == "FORK_STEP":
                if fixed_step.get("branches"):
                    for branch in fixed_step["branches"]:
                        if not branch.get("branch_id"):
                            branch["branch_id"] = f"branch_{uuid.uuid4().hex[:8]}"
                        if not branch.get("branch_name"):
                            branch["branch_name"] = f"Branch"
                if not fixed_step.get("failure_policy"):
                    fixed_step["failure_policy"] = "FAIL_ALL"
            
            # Normalize JOIN_STEP specific fields
            if step_type == "JOIN_STEP":
                if not fixed_step.get("join_mode"):
                    fixed_step["join_mode"] = "ALL"
            
            # Normalize TASK_STEP specific fields
            if step_type == "TASK_STEP":
                fixed_step = self._normalize_task_step(fixed_step)
            
            # Normalize NOTIFY_STEP specific fields
            if step_type == "NOTIFY_STEP":
                if "auto_advance" not in fixed_step:
                    fixed_step["auto_advance"] = True
            
            # Normalize SUB_WORKFLOW_STEP specific fields
            if step_type == "SUB_WORKFLOW_STEP":
                if not fixed_step.get("sub_workflow_name"):
                    fixed_step["sub_workflow_name"] = "Sub-workflow"
            
            fixed_steps.append(fixed_step)
        
        draft["steps"] = fixed_steps
        return draft
    
    def _normalize_section(self, section: Dict[str, Any], idx: int) -> Dict[str, Any]:
        """Normalize a form section"""
        fixed_section = {
            "section_id": section.get("section_id") or f"section_{uuid.uuid4().hex[:8]}",
            "section_title": section.get("section_title") or section.get("title") or f"Section {idx + 1}",
            "order": section.get("order", idx),
            "is_repeating": section.get("is_repeating", False)
        }
        
        # Copy optional fields
        if section.get("section_description"):
            fixed_section["section_description"] = section["section_description"]
        
        # Handle min_rows for repeating sections
        if fixed_section["is_repeating"]:
            min_rows = section.get("min_rows")
            if min_rows is not None and isinstance(min_rows, int) and min_rows >= 0:
                fixed_section["min_rows"] = min_rows
        
        return fixed_section
    
    def _normalize_field(self, field: Dict[str, Any], idx: int) -> Dict[str, Any]:
        """Normalize a single form field"""
        fixed_field = {
            # Handle different naming conventions from AI
            "field_key": field.get("field_key") or field.get("field_id") or field.get("key") or f"field_{idx}",
            "field_label": field.get("field_label") or field.get("label") or field.get("name") or f"Field {idx+1}",
            "field_type": (field.get("field_type") or field.get("type") or "TEXT").upper(),
            "required": field.get("required", False),
            "order": field.get("order", idx),
        }
        
        # Validate field_type is supported
        valid_types = ["TEXT", "TEXTAREA", "NUMBER", "DATE", "SELECT", "MULTISELECT", "CHECKBOX", "FILE", "USER_SELECT"]
        if fixed_field["field_type"] not in valid_types:
            fixed_field["field_type"] = "TEXT"  # Default to TEXT for unknown types
        
        # Copy optional fields
        if field.get("placeholder"):
            fixed_field["placeholder"] = field["placeholder"]
        if field.get("help_text"):
            fixed_field["help_text"] = field["help_text"]
        if field.get("default_value") is not None:
            fixed_field["default_value"] = field["default_value"]
        if field.get("section_id"):
            fixed_field["section_id"] = field["section_id"]
        
        # Handle options for SELECT/MULTISELECT
        if field.get("options"):
            fixed_field["options"] = field["options"]
        elif fixed_field["field_type"] in ["SELECT", "MULTISELECT"]:
            # Provide default options if missing
            fixed_field["options"] = ["Option 1", "Option 2", "Option 3"]
        
        # Handle validation rules
        if field.get("validation"):
            fixed_field["validation"] = self._normalize_validation(field["validation"], fixed_field["field_type"])
        
        # Handle conditional visibility
        if field.get("conditional_visibility"):
            fixed_field["conditional_visibility"] = field["conditional_visibility"]
        
        # Handle conditional requirements
        if field.get("conditional_requirements"):
            fixed_requirements = []
            for req in field["conditional_requirements"]:
                fixed_req = self._normalize_conditional_requirement(req)
                if fixed_req:
                    fixed_requirements.append(fixed_req)
            if fixed_requirements:
                fixed_field["conditional_requirements"] = fixed_requirements
        
        return fixed_field
    
    def _normalize_validation(self, validation: Dict[str, Any], field_type: str) -> Dict[str, Any]:
        """Normalize validation rules"""
        fixed_validation = {}
        
        if validation.get("min_length") is not None:
            fixed_validation["min_length"] = validation["min_length"]
        if validation.get("max_length") is not None:
            fixed_validation["max_length"] = validation["max_length"]
        if validation.get("min_value") is not None:
            fixed_validation["min_value"] = validation["min_value"]
        if validation.get("max_value") is not None:
            fixed_validation["max_value"] = validation["max_value"]
        if validation.get("regex_pattern"):
            fixed_validation["regex_pattern"] = validation["regex_pattern"]
        if validation.get("allowed_values"):
            fixed_validation["allowed_values"] = validation["allowed_values"]
        
        # Handle date_validation for DATE fields
        if field_type == "DATE" and validation.get("date_validation"):
            date_val = validation["date_validation"]
            fixed_validation["date_validation"] = {
                "allow_past_dates": date_val.get("allow_past_dates", True),
                "allow_today": date_val.get("allow_today", True),
                "allow_future_dates": date_val.get("allow_future_dates", True)
            }
        
        return fixed_validation if fixed_validation else None
    
    def _normalize_conditional_requirement(self, req: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Normalize a conditional requirement rule"""
        if not req.get("when") or not req.get("then"):
            return None
        
        when = req["when"]
        then = req["then"]
        
        fixed_req = {
            "rule_id": req.get("rule_id") or f"rule_{uuid.uuid4().hex[:8]}",
            "when": {
                "field_key": when.get("field_key", ""),
                "operator": when.get("operator", "equals").lower(),
                "value": when.get("value")
            },
            "then": {}
        }
        
        # Handle step_id for cross-form conditions
        if when.get("step_id"):
            fixed_req["when"]["step_id"] = when["step_id"]
        
        # Handle compound conditions (AND/OR)
        if when.get("logic"):
            fixed_req["when"]["logic"] = when["logic"].upper()
        if when.get("conditions"):
            fixed_conditions = []
            for cond in when["conditions"]:
                fixed_cond = {
                    "field_key": cond.get("field_key", ""),
                    "operator": cond.get("operator", "equals").lower(),
                    "value": cond.get("value")
                }
                if cond.get("step_id"):
                    fixed_cond["step_id"] = cond["step_id"]
                fixed_conditions.append(fixed_cond)
            fixed_req["when"]["conditions"] = fixed_conditions
        
        # Handle "then" clause
        if "required" in then:
            fixed_req["then"]["required"] = bool(then["required"])
        
        # Handle conditional date_validation
        if then.get("date_validation"):
            date_val = then["date_validation"]
            fixed_req["then"]["date_validation"] = {
                "allow_past_dates": date_val.get("allow_past_dates", True),
                "allow_today": date_val.get("allow_today", True),
                "allow_future_dates": date_val.get("allow_future_dates", True)
            }
        
        return fixed_req
    
    def _normalize_approval_step(self, step: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize APPROVAL_STEP specific fields"""
        # Ensure approver_resolution has a valid value
        resolution = step.get("approver_resolution")
        valid_resolutions = ["REQUESTER_MANAGER", "SPECIFIC_EMAIL", "CONDITIONAL", "STEP_ASSIGNEE", "SPOC_EMAIL"]
        if resolution not in valid_resolutions:
            step["approver_resolution"] = "REQUESTER_MANAGER"
        
        # Normalize parallel approval
        if step.get("parallel_approval"):
            if step["parallel_approval"] not in ["ALL", "ANY"]:
                step["parallel_approval"] = "ALL"
        
        # Normalize conditional approver rules
        if step.get("conditional_approver_rules"):
            for rule in step["conditional_approver_rules"]:
                if rule.get("operator"):
                    rule["operator"] = rule["operator"].upper()
        
        return step
    
    def _normalize_task_step(self, step: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize TASK_STEP specific fields"""
        if "execution_notes_required" not in step:
            step["execution_notes_required"] = True
        
        # Normalize output_fields if present
        if "output_fields" in step and step["output_fields"]:
            fixed_output_fields = []
            for idx, field in enumerate(step["output_fields"]):
                fixed_field = self._normalize_field(field, idx)
                fixed_output_fields.append(fixed_field)
            step["output_fields"] = fixed_output_fields
        
        # Normalize linked_repeating_source if present
        if step.get("linked_repeating_source"):
            lrs = step["linked_repeating_source"]
            step["linked_repeating_source"] = {
                "source_step_id": lrs.get("source_step_id", ""),
                "source_section_id": lrs.get("source_section_id", ""),
                "context_field_keys": lrs.get("context_field_keys", [])
            }
        
        # Normalize sections if present
        if "sections" in step and step["sections"]:
            fixed_sections = []
            for idx, section in enumerate(step["sections"]):
                fixed_section = self._normalize_section(section, idx)
                fixed_sections.append(fixed_section)
            step["sections"] = fixed_sections
        
        return step
    
    def _normalize_transition_condition(self, condition: Dict[str, Any]) -> Dict[str, Any]:
        """
        Normalize transition condition to match expected Pydantic model.
        
        The Condition model requires:
        - 'field' (not 'field_key')
        - 'operator' as uppercase enum (e.g., 'GREATER_THAN' not 'greater_than')
        - 'value' (any type)
        
        ConditionGroup has:
        - 'logic': 'AND' or 'OR'
        - 'conditions': list of Condition objects
        """
        if not condition:
            return condition
        
        # Map common lowercase operators to uppercase
        operator_map = {
            "equals": "EQUALS",
            "not_equals": "NOT_EQUALS",
            "greater_than": "GREATER_THAN",
            "less_than": "LESS_THAN",
            "greater_than_or_equals": "GREATER_THAN_OR_EQUALS",
            "less_than_or_equals": "LESS_THAN_OR_EQUALS",
            "contains": "CONTAINS",
            "not_contains": "NOT_CONTAINS",
            "in": "IN",
            "not_in": "NOT_IN",
            "is_empty": "IS_EMPTY",
            "is_not_empty": "IS_NOT_EMPTY",
            # Already uppercase
            "EQUALS": "EQUALS",
            "NOT_EQUALS": "NOT_EQUALS",
            "GREATER_THAN": "GREATER_THAN",
            "LESS_THAN": "LESS_THAN",
            "GREATER_THAN_OR_EQUALS": "GREATER_THAN_OR_EQUALS",
            "LESS_THAN_OR_EQUALS": "LESS_THAN_OR_EQUALS",
            "CONTAINS": "CONTAINS",
            "NOT_CONTAINS": "NOT_CONTAINS",
            "IN": "IN",
            "NOT_IN": "NOT_IN",
            "IS_EMPTY": "IS_EMPTY",
            "IS_NOT_EMPTY": "IS_NOT_EMPTY",
        }
        
        def normalize_single_condition(cond: Dict[str, Any]) -> Dict[str, Any]:
            """Normalize a single condition object"""
            fixed = {}
            
            # Handle 'field' vs 'field_key' - model expects 'field'
            field_value = cond.get("field") or cond.get("field_key")
            if field_value:
                fixed["field"] = field_value
            
            # Normalize operator to uppercase
            op = cond.get("operator", "")
            if isinstance(op, str):
                fixed["operator"] = operator_map.get(op.lower(), op.upper())
            
            # Copy value
            if "value" in cond:
                fixed["value"] = cond["value"]
            
            return fixed
        
        # Check if this is a ConditionGroup (has 'conditions' array)
        if "conditions" in condition:
            # This is a ConditionGroup
            fixed_group = {
                "logic": condition.get("logic", "AND").upper(),
                "conditions": []
            }
            
            for c in condition.get("conditions", []):
                fixed_group["conditions"].append(normalize_single_condition(c))
            
            return fixed_group
        elif "field" in condition or "field_key" in condition:
            # This is a single condition wrapped as ConditionGroup
            # Pydantic expects ConditionGroup for the condition field
            fixed_cond = normalize_single_condition(condition)
            return {
                "logic": "AND",
                "conditions": [fixed_cond]
            }
        else:
            # Unknown format, return as-is
            return condition
    
    def _generate_default_draft(self, prompt_text: str) -> Dict[str, Any]:
        """Generate a default template when AI is not available"""
        draft = {
            "steps": [
                {
                    "step_id": "step_1",
                    "step_name": "Submit Request",
                    "step_type": "FORM_STEP",
                    "is_start": True,
                    "order": 0,
                    "description": "Initial request form",
                    "sections": [
                        {
                            "section_id": "section_basic",
                            "section_title": "Basic Information",
                            "order": 0,
                            "is_repeating": False
                        }
                    ],
                    "fields": [
                        {
                            "field_key": "title",
                            "field_label": "Request Title",
                            "field_type": "TEXT",
                            "required": True,
                            "order": 0,
                            "placeholder": "Enter a descriptive title",
                            "section_id": "section_basic",
                            "validation": {"min_length": 5, "max_length": 200}
                        },
                        {
                            "field_key": "description",
                            "field_label": "Description",
                            "field_type": "TEXTAREA",
                            "required": True,
                            "order": 1,
                            "placeholder": "Provide detailed information about your request",
                            "section_id": "section_basic"
                        },
                        {
                            "field_key": "priority",
                            "field_label": "Priority",
                            "field_type": "SELECT",
                            "required": True,
                            "order": 2,
                            "section_id": "section_basic",
                            "options": ["Low", "Medium", "High", "Critical"]
                        },
                        {
                            "field_key": "due_date",
                            "field_label": "Requested Due Date",
                            "field_type": "DATE",
                            "required": False,
                            "order": 3,
                            "section_id": "section_basic",
                            "help_text": "When do you need this completed?",
                            "validation": {
                                "date_validation": {
                                    "allow_past_dates": False,
                                    "allow_today": True,
                                    "allow_future_dates": True
                                }
                            }
                        }
                    ]
                },
                {
                    "step_id": "step_2",
                    "step_name": "Manager Approval",
                    "step_type": "APPROVAL_STEP",
                    "order": 1,
                    "approver_resolution": "REQUESTER_MANAGER",
                    "allow_reassign": True,
                    "sla": {
                        "due_minutes": 2880,
                        "reminders": [{"minutes_before_due": 120, "recipients": ["assigned_to"]}]
                    }
                },
                {
                    "step_id": "step_3",
                    "step_name": "Process Request",
                    "step_type": "TASK_STEP",
                    "order": 2,
                    "instructions": "Review and process the approved request. Add execution notes upon completion.",
                    "execution_notes_required": True
                },
                {
                    "step_id": "step_4",
                    "step_name": "Completion",
                    "step_type": "NOTIFY_STEP",
                    "is_terminal": True,
                    "order": 3,
                    "notification_template": "TICKET_COMPLETED",
                    "recipients": ["requester", "approvers"],
                    "auto_advance": True
                }
            ],
            "transitions": [
                {
                    "transition_id": "t_1",
                    "from_step_id": "step_1",
                    "to_step_id": "step_2",
                    "on_event": "SUBMIT_FORM"
                },
                {
                    "transition_id": "t_2",
                    "from_step_id": "step_2",
                    "to_step_id": "step_3",
                    "on_event": "APPROVE"
                },
                {
                    "transition_id": "t_3",
                    "from_step_id": "step_3",
                    "to_step_id": "step_4",
                    "on_event": "COMPLETE_TASK"
                }
            ],
            "start_step_id": "step_1"
        }
        
        return {
            "draft_definition": draft,
            "validation": {"is_valid": True, "errors": [], "warnings": []},
            "ai_metadata": {"note": "Default template - AI not configured"}
        }
    
    def _validate_draft(self, draft: Dict[str, Any]) -> Dict[str, Any]:
        """Comprehensive validation of generated draft"""
        errors = []
        warnings = []
        
        steps = draft.get("steps", [])
        transitions = draft.get("transitions", [])
        start_step_id = draft.get("start_step_id")
        
        if not steps:
            errors.append({"type": "NO_STEPS", "message": "Workflow has no steps defined"})
            return {"is_valid": False, "errors": errors, "warnings": warnings}
        
        if not start_step_id:
            errors.append({"type": "NO_START_STEP_ID", "message": "No start_step_id defined in workflow"})
        
        # Valid enums
        valid_step_types = ["FORM_STEP", "APPROVAL_STEP", "TASK_STEP", "NOTIFY_STEP", "FORK_STEP", "JOIN_STEP", "SUB_WORKFLOW_STEP"]
        valid_field_types = ["TEXT", "TEXTAREA", "NUMBER", "DATE", "SELECT", "MULTISELECT", "CHECKBOX", "FILE", "USER_SELECT"]
        valid_events = ["SUBMIT_FORM", "APPROVE", "REJECT", "COMPLETE_TASK", "RESPOND_INFO", "FORK_ACTIVATED", "BRANCH_COMPLETED", "JOIN_COMPLETE"]
        valid_approver_resolutions = ["REQUESTER_MANAGER", "SPECIFIC_EMAIL", "SPOC_EMAIL", "CONDITIONAL", "STEP_ASSIGNEE"]
        valid_parallel_rules = ["ALL", "ANY"]
        valid_condition_operators = ["EQUALS", "NOT_EQUALS", "GREATER_THAN", "LESS_THAN", "GREATER_THAN_OR_EQUALS", "LESS_THAN_OR_EQUALS", "CONTAINS", "NOT_CONTAINS", "IN", "NOT_IN", "IS_EMPTY", "IS_NOT_EMPTY"]
        valid_join_modes = ["ALL", "ANY", "MAJORITY"]
        valid_failure_policies = ["FAIL_ALL", "CONTINUE_OTHERS", "CANCEL_OTHERS"]
        
        # Build step IDs set and map
        step_ids = set()
        step_map = {}
        fork_steps = {}
        branch_step_ids = set()
        
        for step in steps:
            step_id = step.get("step_id")
            step_type = step.get("step_type")
            
            # Check duplicate IDs
            if step_id in step_ids:
                errors.append({
                    "type": "DUPLICATE_STEP_ID",
                    "message": f"Duplicate step ID: {step_id}"
                })
            step_ids.add(step_id)
            step_map[step_id] = step
            
            # Track fork steps
            if step_type == "FORK_STEP":
                fork_steps[step_id] = step
                for branch in step.get("branches", []):
                    branch_step_ids.add(branch.get("start_step_id"))
            
            # Track branch step IDs
            if step.get("branch_id"):
                branch_step_ids.add(step_id)
        
        # Validate each step
        has_start = False
        has_terminal = False
        
        for step in steps:
            step_id = step.get("step_id")
            step_type = step.get("step_type")
            step_name = step.get("step_name", step_id)
            
            # Check step type validity
            if step_type not in valid_step_types:
                errors.append({
                    "type": "INVALID_STEP_TYPE",
                    "message": f"Invalid step type '{step_type}' in step '{step_name}'. Valid types: {valid_step_types}"
                })
                continue
            
            # Check is_start
            if step.get("is_start"):
                if has_start:
                    errors.append({
                        "type": "MULTIPLE_START_STEPS",
                        "message": f"Multiple steps marked as is_start. Only one step can be the start step."
                    })
                has_start = True
            
            # Check is_terminal
            if step.get("is_terminal"):
                has_terminal = True
            
            # Validate FORM_STEP
            if step_type == "FORM_STEP":
                self._validate_form_step(step, step_name, valid_field_types, errors, warnings)
            
            # Validate APPROVAL_STEP
            elif step_type == "APPROVAL_STEP":
                self._validate_approval_step(step, step_name, step_ids, valid_approver_resolutions, 
                                           valid_parallel_rules, valid_condition_operators, errors, warnings)
            
            # Validate TASK_STEP
            elif step_type == "TASK_STEP":
                self._validate_task_step(step, step_name, valid_field_types, errors, warnings, step_ids)
            
            # Validate NOTIFY_STEP
            elif step_type == "NOTIFY_STEP":
                self._validate_notify_step(step, step_name, errors, warnings)
            
            # Validate FORK_STEP
            elif step_type == "FORK_STEP":
                self._validate_fork_step(step, step_name, step_ids, valid_failure_policies, errors, warnings)
            
            # Validate JOIN_STEP
            elif step_type == "JOIN_STEP":
                self._validate_join_step(step, step_name, fork_steps, valid_join_modes, errors, warnings)
            
            # Validate SUB_WORKFLOW_STEP
            elif step_type == "SUB_WORKFLOW_STEP":
                self._validate_sub_workflow_step(step, step_name, errors, warnings)
            
            # Validate SLA configuration if present
            if step.get("sla"):
                self._validate_sla_config(step.get("sla"), step_name, errors, warnings)
            
            # Validate branch steps have required fields
            if step.get("branch_id"):
                if not step.get("parent_fork_step_id"):
                    errors.append({
                        "type": "BRANCH_MISSING_PARENT",
                        "message": f"Step '{step_name}' has branch_id but missing parent_fork_step_id"
                    })
                elif step.get("parent_fork_step_id") not in fork_steps:
                    errors.append({
                        "type": "INVALID_PARENT_FORK",
                        "message": f"Step '{step_name}' references non-existent fork step '{step.get('parent_fork_step_id')}'"
                    })
        
        # Check start step exists
        if not has_start:
            warnings.append({
                "type": "NO_START_FLAG",
                "message": "No step marked with is_start: true. First step will be used as start."
            })
        
        if start_step_id and start_step_id not in step_ids:
            errors.append({
                "type": "INVALID_START_STEP",
                "message": f"start_step_id '{start_step_id}' not found in steps"
            })
        
        # Check terminal exists
        if not has_terminal:
            warnings.append({
                "type": "NO_TERMINAL_STEP",
                "message": "No step marked with is_terminal: true. Workflow may not complete properly."
            })
        
        # Validate transitions
        self._validate_transitions(transitions, step_ids, step_map, valid_events, errors, warnings)
        
        return {
            "is_valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings
        }
    
    def _validate_form_step(self, step: Dict, step_name: str, valid_field_types: List[str], 
                           errors: List, warnings: List):
        """Validate FORM_STEP specific requirements"""
        fields = step.get("fields", [])
        sections = step.get("sections", [])
        
        if not fields:
            warnings.append({
                "type": "FORM_NO_FIELDS",
                "message": f"Form step '{step_name}' has no fields"
            })
            return
        
        # Validate sections
        section_ids = set()
        for section in sections:
            section_id = section.get("section_id")
            if section_id in section_ids:
                errors.append({
                    "type": "DUPLICATE_SECTION_ID",
                    "message": f"Duplicate section_id '{section_id}' in step '{step_name}'"
                })
            section_ids.add(section_id)
            
            # Validate min_rows for repeating sections
            if section.get("is_repeating"):
                min_rows = section.get("min_rows")
                if min_rows is not None:
                    if not isinstance(min_rows, int) or min_rows < 0:
                        errors.append({
                            "type": "INVALID_MIN_ROWS",
                            "message": f"Section '{section.get('section_title', section_id)}' has invalid min_rows value"
                        })
        
        # Validate fields
        field_keys = set()
        for field in fields:
            self._validate_field(field, step_name, valid_field_types, field_keys, section_ids, errors, warnings)
    
    def _validate_field(self, field: Dict, step_name: str, valid_field_types: List[str],
                       field_keys: set, section_ids: set, errors: List, warnings: List):
        """Validate a single form field"""
        field_key = field.get("field_key")
        field_type = field.get("field_type", "")
        field_label = field.get("field_label", field_key)
        
        # Check duplicate keys
        if field_key in field_keys:
            errors.append({
                "type": "DUPLICATE_FIELD_KEY",
                "message": f"Duplicate field_key '{field_key}' in step '{step_name}'"
            })
        field_keys.add(field_key)
        
        # Check field type
        if field_type not in valid_field_types:
            errors.append({
                "type": "INVALID_FIELD_TYPE",
                "message": f"Invalid field type '{field_type}' for field '{field_label}' in step '{step_name}'. Valid types: {valid_field_types}"
            })
        
        # Check required field_key
        if not field_key:
            errors.append({
                "type": "MISSING_FIELD_KEY",
                "message": f"Field in step '{step_name}' missing field_key"
            })
        
        # Check SELECT/MULTISELECT have options
        if field_type in ["SELECT", "MULTISELECT"]:
            options = field.get("options", [])
            if not options:
                errors.append({
                    "type": "SELECT_NO_OPTIONS",
                    "message": f"Field '{field_label}' ({field_type}) in step '{step_name}' must have options array"
                })
            elif len(options) < 2:
                warnings.append({
                    "type": "SELECT_FEW_OPTIONS",
                    "message": f"Field '{field_label}' in step '{step_name}' has only {len(options)} option(s)"
                })
        
        # Check section_id reference
        if field.get("section_id") and field["section_id"] not in section_ids:
            warnings.append({
                "type": "FIELD_INVALID_SECTION",
                "message": f"Field '{field_label}' references undefined section '{field['section_id']}' in step '{step_name}'"
            })
        
        # Validate validation rules
        if field.get("validation"):
            self._validate_field_validation(field, field_label, step_name, errors, warnings)
        
        # Validate conditional requirements
        if field.get("conditional_requirements"):
            self._validate_conditional_requirements(field, field_label, step_name, errors, warnings)
    
    def _validate_field_validation(self, field: Dict, field_label: str, step_name: str,
                                   errors: List, warnings: List):
        """Validate field validation rules"""
        validation = field["validation"]
        field_type = field.get("field_type", "")
        
        if field_type == "NUMBER":
            min_val = validation.get("min_value")
            max_val = validation.get("max_value")
            if min_val is not None and max_val is not None and min_val > max_val:
                errors.append({
                    "type": "INVALID_VALIDATION",
                    "message": f"Field '{field_label}' has min_value ({min_val}) > max_value ({max_val})"
                })
        
        if field_type in ["TEXT", "TEXTAREA"]:
            min_len = validation.get("min_length")
            max_len = validation.get("max_length")
            if min_len is not None and max_len is not None and min_len > max_len:
                errors.append({
                    "type": "INVALID_VALIDATION",
                    "message": f"Field '{field_label}' has min_length ({min_len}) > max_length ({max_len})"
                })
        
        # Validate date_validation for DATE fields
        if field_type == "DATE" and validation.get("date_validation"):
            date_val = validation["date_validation"]
            allow_past = date_val.get("allow_past_dates", True)
            allow_today = date_val.get("allow_today", True)
            allow_future = date_val.get("allow_future_dates", True)
            
            # Check at least one option is true
            if not allow_past and not allow_today and not allow_future:
                errors.append({
                    "type": "INVALID_DATE_VALIDATION",
                    "message": f"Field '{field_label}' in step '{step_name}' has date_validation that blocks all dates"
                })
    
    def _validate_conditional_requirements(self, field: Dict, field_label: str, step_name: str,
                                          errors: List, warnings: List):
        """Validate conditional requirement rules"""
        requirements = field.get("conditional_requirements", [])
        rule_ids = set()
        
        for i, req in enumerate(requirements):
            rule_id = req.get("rule_id", f"rule_{i}")
            
            # Check duplicate rule IDs
            if rule_id in rule_ids:
                warnings.append({
                    "type": "DUPLICATE_RULE_ID",
                    "message": f"Duplicate rule_id '{rule_id}' in field '{field_label}' in step '{step_name}'"
                })
            rule_ids.add(rule_id)
            
            # Check required fields
            when = req.get("when")
            then = req.get("then")
            
            if not when:
                errors.append({
                    "type": "CONDITIONAL_MISSING_WHEN",
                    "message": f"Conditional rule '{rule_id}' for field '{field_label}' missing 'when' clause"
                })
                continue
            
            if not when.get("field_key"):
                errors.append({
                    "type": "CONDITIONAL_MISSING_FIELD_KEY",
                    "message": f"Conditional rule '{rule_id}' for field '{field_label}' missing 'when.field_key'"
                })
            
            if not then:
                errors.append({
                    "type": "CONDITIONAL_MISSING_THEN",
                    "message": f"Conditional rule '{rule_id}' for field '{field_label}' missing 'then' clause"
                })
                continue
            
            # Validate compound conditions
            if when.get("logic"):
                logic = when["logic"].upper()
                if logic not in ["AND", "OR"]:
                    errors.append({
                        "type": "INVALID_CONDITIONAL_LOGIC",
                        "message": f"Conditional rule '{rule_id}' has invalid logic '{logic}'. Must be AND or OR."
                    })
                
                conditions = when.get("conditions", [])
                if not conditions:
                    warnings.append({
                        "type": "CONDITIONAL_NO_ADDITIONAL_CONDITIONS",
                        "message": f"Conditional rule '{rule_id}' has logic but no additional conditions"
                    })
            
            # Validate date_validation in then clause
            if then.get("date_validation"):
                date_val = then["date_validation"]
                allow_past = date_val.get("allow_past_dates", True)
                allow_today = date_val.get("allow_today", True)
                allow_future = date_val.get("allow_future_dates", True)
                
                if not allow_past and not allow_today and not allow_future:
                    errors.append({
                        "type": "INVALID_CONDITIONAL_DATE_VALIDATION",
                        "message": f"Rule '{rule_id}' for field '{field_label}' has date_validation that blocks all dates"
                    })
    
    def _validate_approval_step(self, step: Dict, step_name: str, step_ids: set,
                               valid_resolutions: List[str], valid_parallel_rules: List[str],
                               valid_operators: List[str], errors: List, warnings: List):
        """Validate APPROVAL_STEP specific requirements"""
        approver_res = step.get("approver_resolution")
        
        if not approver_res:
            errors.append({
                "type": "MISSING_APPROVER_RESOLUTION",
                "message": f"Approval step '{step_name}' missing approver_resolution"
            })
            return
        
        if approver_res not in valid_resolutions:
            errors.append({
                "type": "INVALID_APPROVER_RESOLUTION",
                "message": f"Invalid approver_resolution '{approver_res}' in step '{step_name}'. Valid: {valid_resolutions}"
            })
            return
        
        # SPECIFIC_EMAIL validation
        if approver_res == "SPECIFIC_EMAIL":
            if not step.get("specific_approver_email") and not step.get("parallel_approvers"):
                errors.append({
                    "type": "MISSING_SPECIFIC_APPROVER",
                    "message": f"Approval step '{step_name}' with SPECIFIC_EMAIL resolution needs specific_approver_email or parallel_approvers"
                })
        
        # SPOC_EMAIL validation
        if approver_res == "SPOC_EMAIL":
            if not step.get("spoc_email"):
                errors.append({
                    "type": "MISSING_SPOC_EMAIL",
                    "message": f"Approval step '{step_name}' with SPOC_EMAIL resolution needs spoc_email"
                })
        
        # CONDITIONAL validation
        if approver_res == "CONDITIONAL":
            rules = step.get("conditional_approver_rules", [])
            if not rules:
                errors.append({
                    "type": "MISSING_CONDITIONAL_RULES",
                    "message": f"Approval step '{step_name}' with CONDITIONAL resolution needs conditional_approver_rules"
                })
            else:
                for i, rule in enumerate(rules):
                    if not rule.get("field_key"):
                        errors.append({
                            "type": "CONDITIONAL_RULE_MISSING_FIELD",
                            "message": f"Conditional rule {i+1} in step '{step_name}' missing field_key"
                        })
                    if rule.get("operator") and rule["operator"].upper() not in valid_operators:
                        errors.append({
                            "type": "INVALID_CONDITION_OPERATOR",
                            "message": f"Invalid operator '{rule['operator']}' in conditional rule {i+1} of step '{step_name}'"
                        })
                    if not rule.get("approver_email"):
                        errors.append({
                            "type": "CONDITIONAL_RULE_MISSING_APPROVER",
                            "message": f"Conditional rule {i+1} in step '{step_name}' missing approver_email"
                        })
        
        # STEP_ASSIGNEE validation
        if approver_res == "STEP_ASSIGNEE":
            ref_step = step.get("step_assignee_step_id")
            if not ref_step:
                errors.append({
                    "type": "MISSING_STEP_ASSIGNEE_REF",
                    "message": f"Approval step '{step_name}' with STEP_ASSIGNEE resolution needs step_assignee_step_id"
                })
            elif ref_step not in step_ids:
                errors.append({
                    "type": "INVALID_STEP_ASSIGNEE_REF",
                    "message": f"step_assignee_step_id '{ref_step}' in step '{step_name}' not found"
                })
        
        # Parallel approval validation
        if step.get("parallel_approval"):
            if step["parallel_approval"] not in valid_parallel_rules:
                errors.append({
                    "type": "INVALID_PARALLEL_RULE",
                    "message": f"Invalid parallel_approval '{step['parallel_approval']}' in step '{step_name}'. Valid: {valid_parallel_rules}"
                })
            
            approvers = step.get("parallel_approvers", [])
            if not approvers:
                errors.append({
                    "type": "PARALLEL_NO_APPROVERS",
                    "message": f"Step '{step_name}' has parallel_approval but no parallel_approvers"
                })
            elif len(approvers) < 2:
                warnings.append({
                    "type": "PARALLEL_SINGLE_APPROVER",
                    "message": f"Step '{step_name}' has parallel_approval but only one approver"
                })
            
            if not step.get("primary_approver_email"):
                warnings.append({
                    "type": "MISSING_PRIMARY_APPROVER",
                    "message": f"Step '{step_name}' with parallel approval should have primary_approver_email for task assignment"
                })
    
    def _validate_task_step(self, step: Dict, step_name: str, valid_field_types: List[str],
                           errors: List, warnings: List, step_ids: set = None):
        """Validate TASK_STEP specific requirements"""
        if not step.get("instructions"):
            warnings.append({
                "type": "TASK_NO_INSTRUCTIONS",
                "message": f"Task step '{step_name}' has no instructions"
            })
        
        # Validate embedded fields if present
        if step.get("fields"):
            field_keys = set()
            section_ids = set()
            
            # Collect section IDs first
            for section in step.get("sections", []):
                section_ids.add(section.get("section_id"))
            
            for field in step["fields"]:
                self._validate_field(field, step_name, valid_field_types, field_keys, section_ids, errors, warnings)
        
        # Validate linked_repeating_source if present
        if step.get("linked_repeating_source"):
            lrs = step["linked_repeating_source"]
            if not lrs.get("source_step_id"):
                errors.append({
                    "type": "LRS_MISSING_STEP",
                    "message": f"linked_repeating_source in task '{step_name}' missing source_step_id"
                })
            elif step_ids and lrs["source_step_id"] not in step_ids:
                errors.append({
                    "type": "LRS_INVALID_STEP",
                    "message": f"linked_repeating_source source_step_id '{lrs['source_step_id']}' in task '{step_name}' not found"
                })
            if not lrs.get("source_section_id"):
                errors.append({
                    "type": "LRS_MISSING_SECTION",
                    "message": f"linked_repeating_source in task '{step_name}' missing source_section_id"
                })
        
        # Validate output_fields if present
        if step.get("output_fields"):
            for field in step["output_fields"]:
                field_type = field.get("field_type", "")
                field_label = field.get("field_label", field.get("field_key"))
                if field_type in ["SELECT", "MULTISELECT"] and not field.get("options"):
                    errors.append({
                        "type": "OUTPUT_FIELD_NO_OPTIONS",
                        "message": f"Output field '{field_label}' ({field_type}) in task step '{step_name}' needs options"
                    })
    
    def _validate_notify_step(self, step: Dict, step_name: str, errors: List, warnings: List):
        """Validate NOTIFY_STEP specific requirements"""
        valid_templates = [
            "TICKET_CREATED", "APPROVAL_PENDING", "APPROVAL_REASSIGNED", "APPROVED", "REJECTED",
            "INFO_REQUESTED", "INFO_RESPONDED", "FORM_PENDING", "TASK_ASSIGNED", "TASK_REASSIGNED",
            "TASK_COMPLETED", "SLA_REMINDER", "SLA_ESCALATION", "TICKET_CANCELLED", "TICKET_COMPLETED"
        ]
        
        notification_template = step.get("notification_template")
        if notification_template and notification_template not in valid_templates:
            warnings.append({
                "type": "INVALID_NOTIFICATION_TEMPLATE",
                "message": f"Notification template '{notification_template}' in step '{step_name}' may not be valid. Valid templates: {valid_templates}"
            })
        
        recipients = step.get("recipients", [])
        if not recipients:
            warnings.append({
                "type": "NOTIFY_NO_RECIPIENTS",
                "message": f"Notify step '{step_name}' has no recipients defined"
            })
    
    def _validate_sla_config(self, sla: Dict, step_name: str, errors: List, warnings: List):
        """Validate SLA configuration"""
        due_minutes = sla.get("due_minutes")
        
        if due_minutes is not None:
            if not isinstance(due_minutes, (int, float)) or due_minutes <= 0:
                errors.append({
                    "type": "INVALID_SLA_DUE",
                    "message": f"SLA due_minutes in step '{step_name}' must be a positive number"
                })
        
        # Validate reminders
        reminders = sla.get("reminders", [])
        for i, reminder in enumerate(reminders):
            mins = reminder.get("minutes_before_due")
            if mins is not None and (not isinstance(mins, (int, float)) or mins <= 0):
                warnings.append({
                    "type": "INVALID_SLA_REMINDER",
                    "message": f"SLA reminder {i+1} in step '{step_name}' has invalid minutes_before_due"
                })
            if not reminder.get("recipients"):
                warnings.append({
                    "type": "SLA_REMINDER_NO_RECIPIENTS",
                    "message": f"SLA reminder {i+1} in step '{step_name}' has no recipients"
                })
        
        # Validate escalations
        escalations = sla.get("escalations", [])
        for i, escalation in enumerate(escalations):
            mins = escalation.get("minutes_after_due")
            if mins is not None and (not isinstance(mins, (int, float)) or mins < 0):
                warnings.append({
                    "type": "INVALID_SLA_ESCALATION",
                    "message": f"SLA escalation {i+1} in step '{step_name}' has invalid minutes_after_due"
                })
            if not escalation.get("recipients"):
                warnings.append({
                    "type": "SLA_ESCALATION_NO_RECIPIENTS",
                    "message": f"SLA escalation {i+1} in step '{step_name}' has no recipients"
                })
    
    def _validate_fork_step(self, step: Dict, step_name: str, step_ids: set,
                           valid_failure_policies: List[str], errors: List, warnings: List):
        """Validate FORK_STEP specific requirements"""
        branches = step.get("branches", [])
        
        if not branches:
            errors.append({
                "type": "FORK_NO_BRANCHES",
                "message": f"Fork step '{step_name}' has no branches defined"
            })
            return
        
        if len(branches) < 2:
            warnings.append({
                "type": "FORK_SINGLE_BRANCH",
                "message": f"Fork step '{step_name}' has only one branch - consider if forking is needed"
            })
        
        branch_ids = set()
        for i, branch in enumerate(branches):
            branch_id = branch.get("branch_id")
            branch_name = branch.get("branch_name", f"Branch {i+1}")
            
            if branch_id in branch_ids:
                errors.append({
                    "type": "DUPLICATE_BRANCH_ID",
                    "message": f"Duplicate branch_id '{branch_id}' in fork step '{step_name}'"
                })
            branch_ids.add(branch_id)
            
            if not branch.get("start_step_id"):
                errors.append({
                    "type": "BRANCH_NO_START",
                    "message": f"Branch '{branch_name}' in fork step '{step_name}' missing start_step_id"
                })
            elif branch["start_step_id"] not in step_ids:
                errors.append({
                    "type": "BRANCH_INVALID_START",
                    "message": f"Branch '{branch_name}' start_step_id '{branch['start_step_id']}' not found"
                })
        
        failure_policy = step.get("failure_policy", "FAIL_ALL")
        if failure_policy not in valid_failure_policies:
            errors.append({
                "type": "INVALID_FAILURE_POLICY",
                "message": f"Invalid failure_policy '{failure_policy}' in fork step '{step_name}'. Valid: {valid_failure_policies}"
            })
    
    def _validate_join_step(self, step: Dict, step_name: str, fork_steps: Dict,
                           valid_join_modes: List[str], errors: List, warnings: List):
        """Validate JOIN_STEP specific requirements"""
        source_fork = step.get("source_fork_step_id")
        
        if not source_fork:
            errors.append({
                "type": "JOIN_NO_SOURCE_FORK",
                "message": f"Join step '{step_name}' missing source_fork_step_id"
            })
        elif source_fork not in fork_steps:
            errors.append({
                "type": "JOIN_INVALID_SOURCE_FORK",
                "message": f"Join step '{step_name}' references non-existent fork step '{source_fork}'"
            })
        
        join_mode = step.get("join_mode", "ALL")
        if join_mode not in valid_join_modes:
            errors.append({
                "type": "INVALID_JOIN_MODE",
                "message": f"Invalid join_mode '{join_mode}' in join step '{step_name}'. Valid: {valid_join_modes}"
            })
    
    def _validate_sub_workflow_step(self, step: Dict, step_name: str, errors: List, warnings: List):
        """Validate SUB_WORKFLOW_STEP specific requirements"""
        if not step.get("sub_workflow_id"):
            errors.append({
                "type": "SUB_WORKFLOW_MISSING_ID",
                "message": f"Sub-workflow step '{step_name}' missing sub_workflow_id"
            })
        
        if step.get("sub_workflow_version") is None:
            errors.append({
                "type": "SUB_WORKFLOW_MISSING_VERSION",
                "message": f"Sub-workflow step '{step_name}' missing sub_workflow_version"
            })
        
        if not step.get("sub_workflow_name"):
            warnings.append({
                "type": "SUB_WORKFLOW_MISSING_NAME",
                "message": f"Sub-workflow step '{step_name}' should have sub_workflow_name for display"
            })
    
    def _validate_transitions(self, transitions: List, step_ids: set, step_map: Dict,
                             valid_events: List[str], errors: List, warnings: List):
        """Validate all transitions"""
        transition_ids = set()
        outgoing_transitions = {}  # step_id -> list of transitions
        incoming_transitions = {}  # step_id -> list of transitions
        
        for t in transitions:
            tid = t.get("transition_id")
            from_step = t.get("from_step_id")
            to_step = t.get("to_step_id")
            on_event = t.get("on_event")
            
            # Check duplicate IDs
            if tid in transition_ids:
                errors.append({
                    "type": "DUPLICATE_TRANSITION_ID",
                    "message": f"Duplicate transition_id: {tid}"
                })
            transition_ids.add(tid)
            
            # Check transition_id exists
            if not tid:
                errors.append({
                    "type": "MISSING_TRANSITION_ID",
                    "message": f"Transition from '{from_step}' to '{to_step}' missing transition_id"
                })
            
            # Check event
            if not on_event:
                errors.append({
                    "type": "MISSING_TRANSITION_EVENT",
                    "message": f"Transition '{tid}' missing on_event"
                })
            elif on_event not in valid_events:
                errors.append({
                    "type": "INVALID_TRANSITION_EVENT",
                    "message": f"Invalid on_event '{on_event}' in transition '{tid}'. Valid: {valid_events}"
                })
            
            # Check step references
            if from_step and from_step not in step_ids:
                errors.append({
                    "type": "INVALID_FROM_STEP",
                    "message": f"Transition '{tid}' from_step_id '{from_step}' not found"
                })
            else:
                outgoing_transitions.setdefault(from_step, []).append(t)
            
            if to_step and to_step not in step_ids:
                errors.append({
                    "type": "INVALID_TO_STEP",
                    "message": f"Transition '{tid}' to_step_id '{to_step}' not found"
                })
            else:
                incoming_transitions.setdefault(to_step, []).append(t)
            
            # Validate event matches step type
            if from_step in step_map and on_event:
                step_type = step_map[from_step].get("step_type")
                if step_type == "FORM_STEP" and on_event not in ["SUBMIT_FORM"]:
                    warnings.append({
                        "type": "MISMATCHED_EVENT",
                        "message": f"Transition '{tid}' from FORM_STEP uses '{on_event}' instead of SUBMIT_FORM"
                    })
                elif step_type == "APPROVAL_STEP" and on_event not in ["APPROVE", "REJECT"]:
                    warnings.append({
                        "type": "MISMATCHED_EVENT",
                        "message": f"Transition '{tid}' from APPROVAL_STEP should use APPROVE or REJECT"
                    })
                elif step_type == "TASK_STEP" and on_event not in ["COMPLETE_TASK"]:
                    warnings.append({
                        "type": "MISMATCHED_EVENT",
                        "message": f"Transition '{tid}' from TASK_STEP should use COMPLETE_TASK"
                    })
        
        # Check for steps without transitions (except terminal)
        for step_id, step in step_map.items():
            if not step.get("is_terminal") and step_id not in outgoing_transitions:
                # Special case: branch end steps transition to join implicitly
                if not step.get("branch_id"):
                    warnings.append({
                        "type": "STEP_NO_OUTGOING",
                        "message": f"Step '{step.get('step_name', step_id)}' has no outgoing transitions"
                    })
    
    def refine_workflow_draft(
        self,
        current_definition: Dict[str, Any],
        refinement_prompt: str,
        actor: ActorContext
    ) -> Dict[str, Any]:
        """Refine existing workflow with AI"""
        if not self.client:
            return {
                "draft_definition": current_definition,
                "validation": {"is_valid": True, "errors": [], "warnings": []},
                "ai_metadata": {"note": "AI not configured"}
            }
        
        try:
            messages = [
                {"role": "system", "content": self._get_system_prompt()},
                {
                    "role": "user",
                    "content": f"""Current workflow definition:
{json.dumps(current_definition, indent=2)}

Refinement request: {refinement_prompt}

Important: 
- Maintain all existing step_ids and transition_ids where possible
- Only modify what's necessary for the refinement
- Preserve all existing fields, sections, and configurations unless explicitly asked to change
- Keep conditional_requirements, date_validation, and min_rows settings intact unless changing them"""
                }
            ]
            
            response = self.client.chat.completions.create(
                model=settings.azure_openai_deployment,
                messages=messages,
                temperature=0.7,
                max_tokens=8000,
                response_format={"type": "json_object"}
            )
            
            content = response.choices[0].message.content
            draft_definition = json.loads(content)
            
            # Normalize field names
            draft_definition = self._normalize_definition(draft_definition)
            
            validation = self._validate_draft(draft_definition)
            
            return {
                "draft_definition": draft_definition,
                "validation": validation,
                "ai_metadata": {
                    "model": settings.azure_openai_deployment,
                    "refinement": True
                }
            }
            
        except Exception as e:
            logger.error(f"AI refinement failed: {e}")
            raise OpenAIError(f"Failed to refine workflow: {str(e)}")
    
    def suggest_steps(
        self,
        context: Dict[str, Any],
        current_steps: List[Dict[str, Any]],
        actor: ActorContext
    ) -> List[Dict[str, Any]]:
        """Suggest next steps based on context"""
        suggestions = []
        
        step_types_used = {step.get("step_type") for step in current_steps}
        has_fork = "FORK_STEP" in step_types_used
        has_join = "JOIN_STEP" in step_types_used
        
        if "FORM_STEP" not in step_types_used:
            suggestions.append({
                "type": "FORM_STEP",
                "name": "Request Form",
                "description": "Collect information from requester with customizable fields, sections, and validation rules"
            })
        
        if "APPROVAL_STEP" not in step_types_used:
            suggestions.append({
                "type": "APPROVAL_STEP",
                "name": "Manager Approval",
                "description": "Route to manager, specific person, or conditional approvers based on form values"
            })
        
        if "TASK_STEP" not in step_types_used:
            suggestions.append({
                "type": "TASK_STEP",
                "name": "Processing Task",
                "description": "Assign work to an agent with optional embedded form and linked repeating data"
            })
        
        if not has_fork:
            suggestions.append({
                "type": "FORK_STEP",
                "name": "Parallel Processing",
                "description": "Split workflow into parallel branches for concurrent execution by different teams"
            })
        
        if has_fork and not has_join:
            suggestions.append({
                "type": "JOIN_STEP",
                "name": "Merge Branches",
                "description": "Wait for parallel branches to complete before continuing"
            })
        
        if "SUB_WORKFLOW_STEP" not in step_types_used:
            suggestions.append({
                "type": "SUB_WORKFLOW_STEP",
                "name": "Reusable Process",
                "description": "Embed a published workflow as a reusable component"
            })
        
        if "NOTIFY_STEP" not in step_types_used:
            suggestions.append({
                "type": "NOTIFY_STEP",
                "name": "Completion Notification",
                "description": "Send notification to stakeholders (usually terminal step)"
            })
        
        return suggestions
    
    def validate_description(
        self,
        description: str,
        actor: ActorContext
    ) -> Dict[str, Any]:
        """Validate if description is suitable for workflow generation"""
        if len(description) < 20:
            return {
                "is_valid": False,
                "message": "Description is too short. Please provide more details about the workflow.",
                "suggestions": [
                    "Describe what the workflow should accomplish",
                    "Mention the steps or stages involved",
                    "Specify who needs to approve or process requests",
                    "Describe what information needs to be collected"
                ]
            }
        
        if len(description) > 5000:
            return {
                "is_valid": False,
                "message": "Description is too long. Please be more concise.",
                "suggestions": [
                    "Focus on the main steps and requirements",
                    "Remove unnecessary details"
                ]
            }
        
        # Suggest improvements based on content
        suggestions = []
        desc_lower = description.lower()
        
        if "approval" not in desc_lower and "approve" not in desc_lower:
            suggestions.append("Consider if approval steps are needed")
        
        if "form" not in desc_lower and "collect" not in desc_lower and "input" not in desc_lower:
            suggestions.append("Specify what information needs to be collected")
        
        if "parallel" not in desc_lower and ("and" in desc_lower or "simultaneously" in desc_lower):
            suggestions.append("If tasks should run in parallel, mention 'parallel branches'")
        
        if "date" in desc_lower and "restrict" not in desc_lower and "only" not in desc_lower:
            suggestions.append("If dates have restrictions (future only, no past dates), specify them")
        
        if "multiple" in desc_lower or "list" in desc_lower or "items" in desc_lower:
            suggestions.append("For multiple items/rows, consider using repeating sections with min_rows")
        
        if "condition" in desc_lower or "depends" in desc_lower or "if" in desc_lower:
            suggestions.append("For conditional logic, describe when fields should appear or become required")
        
        return {
            "is_valid": True,
            "message": "Description looks good!",
            "suggestions": suggestions
        }
