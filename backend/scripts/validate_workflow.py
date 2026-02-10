"""Script to validate a workflow definition"""
import json
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.path.insert(0, ".")

from app.repositories.mongo_client import get_database

def validate_workflow(workflow_id: str):
    db = get_database()
    
    # Check workflow_versions for published version
    version = db.workflow_versions.find_one({"workflow_id": workflow_id})
    if not version:
        # Try workflow_templates
        version = db.workflow_templates.find_one({"workflow_id": workflow_id})
    
    if not version:
        print(f"❌ Workflow {workflow_id} not found")
        return
    
    print(f"✅ Found workflow: {version.get('name')}")
    print(f"   Version: {version.get('version_number')}")
    print(f"   Category: {version.get('category')}")
    print()
    
    definition = version.get("definition", {})
    steps = definition.get("steps", [])
    transitions = definition.get("transitions", [])
    start_step_id = definition.get("start_step_id")
    
    print("=" * 60)
    print("WORKFLOW ANALYSIS")
    print("=" * 60)
    
    # Count step types
    step_types = {}
    for step in steps:
        st = step.get("step_type", "UNKNOWN")
        step_types[st] = step_types.get(st, 0) + 1
    
    print(f"\n📊 STEP SUMMARY ({len(steps)} total):")
    for st, count in step_types.items():
        print(f"   • {st}: {count}")
    
    print(f"\n🔗 TRANSITIONS: {len(transitions)}")
    print(f"🚀 START STEP: {start_step_id}")
    
    # Detailed step analysis
    print("\n" + "=" * 60)
    print("DETAILED STEP ANALYSIS")
    print("=" * 60)
    
    for i, step in enumerate(steps):
        step_id = step.get("step_id")
        step_name = step.get("step_name")
        step_type = step.get("step_type")
        
        print(f"\n{i+1}. [{step_type}] {step_name}")
        print(f"   ID: {step_id}")
        
        if step.get("is_start"):
            print("   ⭐ START STEP")
        if step.get("is_terminal"):
            print("   🏁 TERMINAL STEP")
        
        # FORM_STEP details
        if step_type == "FORM_STEP":
            fields = step.get("fields", [])
            sections = step.get("sections", [])
            print(f"   📋 Fields: {len(fields)}")
            for field in fields:
                req = "✓" if field.get("required") else "○"
                print(f"      {req} {field.get('field_label')} ({field.get('field_type')})")
                if field.get("options"):
                    print(f"         Options: {field.get('options')[:3]}{'...' if len(field.get('options', [])) > 3 else ''}")
                if field.get("validation"):
                    print(f"         Validation: {field.get('validation')}")
            if sections:
                print(f"   📂 Sections: {len(sections)}")
                for sec in sections:
                    rep = "🔄" if sec.get("is_repeating") else "📁"
                    print(f"      {rep} {sec.get('section_title')}")
        
        # APPROVAL_STEP details
        elif step_type == "APPROVAL_STEP":
            res = step.get("approver_resolution")
            print(f"   👤 Resolution: {res}")
            if res == "CONDITIONAL":
                rules = step.get("conditional_approver_rules", [])
                print(f"   📋 Conditional Rules: {len(rules)}")
                for rule in rules:
                    print(f"      • If {rule.get('field_key')} {rule.get('operator')} '{rule.get('value')}' → {rule.get('approver_email', 'N/A')}")
                if step.get("conditional_fallback_approver"):
                    print(f"      • Fallback: {step.get('conditional_fallback_approver')}")
            elif res == "SPECIFIC_EMAIL":
                if step.get("parallel_approval"):
                    print(f"   👥 Parallel: {step.get('parallel_approval')}")
                    print(f"   👥 Approvers: {step.get('parallel_approvers', [])}")
                else:
                    print(f"   📧 Approver: {step.get('specific_approver_email')}")
            if step.get("sla"):
                print(f"   ⏱️ SLA: {step.get('sla').get('due_minutes')} minutes")
        
        # TASK_STEP details
        elif step_type == "TASK_STEP":
            if step.get("instructions"):
                instr = step.get("instructions")[:50] + "..." if len(step.get("instructions", "")) > 50 else step.get("instructions", "")
                print(f"   📝 Instructions: {instr}")
            if step.get("fields"):
                print(f"   📋 Embedded Fields: {len(step.get('fields'))}")
            if step.get("linked_repeating_source"):
                lrs = step.get("linked_repeating_source")
                print(f"   🔗 Linked to: {lrs.get('source_step_id')} / {lrs.get('source_section_id')}")
            if step.get("sla"):
                print(f"   ⏱️ SLA: {step.get('sla').get('due_minutes')} minutes")
        
        # FORK_STEP details
        elif step_type == "FORK_STEP":
            branches = step.get("branches", [])
            print(f"   🌿 Branches: {len(branches)}")
            for branch in branches:
                print(f"      • {branch.get('branch_name')} → {branch.get('start_step_id')}")
            print(f"   ⚠️ Failure Policy: {step.get('failure_policy', 'N/A')}")
        
        # JOIN_STEP details
        elif step_type == "JOIN_STEP":
            print(f"   🔀 Source Fork: {step.get('source_fork_step_id')}")
            print(f"   🎯 Join Mode: {step.get('join_mode', 'ALL')}")
        
        # NOTIFY_STEP details
        elif step_type == "NOTIFY_STEP":
            print(f"   📧 Template: {step.get('notification_template', 'N/A')}")
            print(f"   👥 Recipients: {step.get('recipients', [])}")
        
        # Branch info
        if step.get("branch_id"):
            print(f"   🌿 Branch: {step.get('branch_id')}")
            print(f"   🔗 Parent Fork: {step.get('parent_fork_step_id')}")
    
    # Transition analysis
    print("\n" + "=" * 60)
    print("TRANSITION FLOW")
    print("=" * 60)
    
    step_names = {s.get("step_id"): s.get("step_name") for s in steps}
    
    for t in transitions:
        from_name = step_names.get(t.get("from_step_id"), t.get("from_step_id"))
        to_name = step_names.get(t.get("to_step_id"), t.get("to_step_id"))
        event = t.get("on_event")
        print(f"   {from_name} --[{event}]--> {to_name}")
    
    # Validation
    print("\n" + "=" * 60)
    print("VALIDATION RESULTS")
    print("=" * 60)
    
    errors = []
    warnings = []
    
    # Check start step
    start_exists = any(s.get("step_id") == start_step_id for s in steps)
    if not start_exists:
        errors.append(f"Start step '{start_step_id}' not found in steps")
    else:
        print("✅ Start step exists")
    
    # Check terminal step
    has_terminal = any(s.get("is_terminal") for s in steps)
    if not has_terminal:
        warnings.append("No terminal step defined")
    else:
        print("✅ Terminal step exists")
    
    # Check all step references in transitions
    step_ids = {s.get("step_id") for s in steps}
    for t in transitions:
        if t.get("from_step_id") not in step_ids:
            errors.append(f"Transition references non-existent from_step: {t.get('from_step_id')}")
        if t.get("to_step_id") not in step_ids:
            errors.append(f"Transition references non-existent to_step: {t.get('to_step_id')}")
    
    if not errors:
        print("✅ All transition references valid")
    
    # Check fork/join pairing
    fork_ids = [s.get("step_id") for s in steps if s.get("step_type") == "FORK_STEP"]
    join_steps = [s for s in steps if s.get("step_type") == "JOIN_STEP"]
    
    for join in join_steps:
        if join.get("source_fork_step_id") not in fork_ids:
            errors.append(f"Join step references non-existent fork: {join.get('source_fork_step_id')}")
    
    if fork_ids and join_steps:
        print("✅ Fork/Join pairing valid")
    
    # Check branch steps have parent_fork
    for step in steps:
        if step.get("branch_id") and not step.get("parent_fork_step_id"):
            errors.append(f"Branch step '{step.get('step_name')}' missing parent_fork_step_id")
    
    # Print results
    if errors:
        print("\n❌ ERRORS:")
        for e in errors:
            print(f"   • {e}")
    
    if warnings:
        print("\n⚠️ WARNINGS:")
        for w in warnings:
            print(f"   • {w}")
    
    if not errors and not warnings:
        print("\n🎉 WORKFLOW IS VALID!")
    elif not errors:
        print("\n✅ WORKFLOW IS VALID (with warnings)")
    else:
        print("\n❌ WORKFLOW HAS ERRORS")
    
    # Print raw JSON for debugging
    print("\n" + "=" * 60)
    print("RAW DEFINITION (for debugging)")
    print("=" * 60)
    print(json.dumps(definition, indent=2, default=str))

if __name__ == "__main__":
    workflow_id = "WF-6aaba4d2fb47"
    validate_workflow(workflow_id)
