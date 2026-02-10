"""
Email Templates - Beautiful, Professional HTML Email Templates

These are the default templates that look so good admins won't need to edit them.
All templates are customizable through the Admin Panel.
"""
from typing import Dict, Any, Optional
from enum import Enum


class EmailTemplateKey(str, Enum):
    """All available email template types"""
    TICKET_CREATED = "TICKET_CREATED"
    APPROVAL_PENDING = "APPROVAL_PENDING"
    APPROVAL_REASSIGNED = "APPROVAL_REASSIGNED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    SKIPPED = "SKIPPED"
    INFO_REQUESTED = "INFO_REQUESTED"
    INFO_RESPONDED = "INFO_RESPONDED"
    FORM_PENDING = "FORM_PENDING"
    TASK_ASSIGNED = "TASK_ASSIGNED"
    TASK_REASSIGNED = "TASK_REASSIGNED"
    TASK_COMPLETED = "TASK_COMPLETED"
    NOTE_ADDED = "NOTE_ADDED"
    REQUESTER_NOTE_ADDED = "REQUESTER_NOTE_ADDED"  # Note from ticket requester
    SLA_REMINDER = "SLA_REMINDER"
    SLA_ESCALATION = "SLA_ESCALATION"
    TICKET_CANCELLED = "TICKET_CANCELLED"
    TICKET_COMPLETED = "TICKET_COMPLETED"
    LOOKUP_USER_ASSIGNED = "LOOKUP_USER_ASSIGNED"
    # Change Request templates
    CHANGE_REQUEST_PENDING = "CHANGE_REQUEST_PENDING"  # To approver when CR is created
    CHANGE_REQUEST_SUBMITTED = "CHANGE_REQUEST_SUBMITTED"  # Confirmation to requester
    CHANGE_REQUEST_APPROVED = "CHANGE_REQUEST_APPROVED"  # To requester when CR is approved
    CHANGE_REQUEST_REJECTED = "CHANGE_REQUEST_REJECTED"  # To requester when CR is rejected
    CHANGE_REQUEST_CANCELLED = "CHANGE_REQUEST_CANCELLED"  # To approver when CR is cancelled
    CHANGE_REQUEST_WORKFLOW_PAUSED = "CHANGE_REQUEST_WORKFLOW_PAUSED"  # To all parties when workflow paused for CR
    CHANGE_REQUEST_WORKFLOW_RESUMED = "CHANGE_REQUEST_WORKFLOW_RESUMED"  # To all parties when workflow resumed


# =============================================================================
# Base Template Wrapper - Premium Design System
# =============================================================================

def get_base_template(
    content: str,
    action_button_text: Optional[str] = None,
    action_button_url: Optional[str] = None,
    footer_note: Optional[str] = None,
    accent_color: str = "#3B82F6"  # Blue-500
) -> str:
    """
    Premium email base template with Outlook-compatible design
    
    Features:
    - Fully compatible with Outlook, Gmail, Apple Mail
    - Uses tables for reliable rendering
    - VML fallbacks for Outlook buttons
    - Professional branding
    """
    
    # Outlook-compatible button using VML
    button_html = ""
    if action_button_text and action_button_url:
        button_html = f'''
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 32px 0;">
            <tr>
                <td align="center">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="{action_button_url}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="10%" strokecolor="{accent_color}" fillcolor="{accent_color}">
                        <w:anchorlock/>
                        <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;">{action_button_text}</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <a href="{action_button_url}" 
                       style="display: inline-block; 
                              background-color: {accent_color};
                              color: #ffffff; 
                              text-decoration: none; 
                              padding: 14px 32px; 
                              border-radius: 8px; 
                              font-weight: 600; 
                              font-size: 14px;
                              font-family: Arial, sans-serif;
                              mso-hide: all;">
                        {action_button_text}
                    </a>
                    <!--<![endif]-->
                </td>
            </tr>
        </table>
        '''
    
    footer_note_html = ""
    if footer_note:
        footer_note_html = f'''
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top: 16px;">
            <tr>
                <td style="padding: 16px; background-color: #FEF3C7; font-size: 13px; color: #92400E; font-family: Arial, sans-serif;">
                    ⚠️ {footer_note}
                </td>
            </tr>
        </table>
        '''
    
    return f'''
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>NOVA.ai Workflow</title>
    <!--[if mso]>
    <noscript>
        <xml>
            <o:OfficeDocumentSettings>
                <o:PixelsPerInch>96</o:PixelsPerInch>
            </o:OfficeDocumentSettings>
        </xml>
    </noscript>
    <style type="text/css">
        body, table, td, p, a {{font-family: Arial, Helvetica, sans-serif !important;}}
    </style>
    <![endif]-->
    <style type="text/css">
        body {{margin: 0; padding: 0; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;}}
        table {{border-collapse: collapse;}}
        img {{border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none;}}
    </style>
</head>
<body style="margin: 0; padding: 0; background-color: #F8FAFC; font-family: Arial, Helvetica, sans-serif;">
    
    <!-- Preheader (hidden text for email preview) -->
    <div style="display: none; max-height: 0px; overflow: hidden; mso-hide: all;">
        NOVA.ai Workflow Notification
    </div>
    
    <!-- Main Container -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #F8FAFC;">
        <tr>
            <td style="padding: 32px 20px;">
                
                <!-- Centered Content Table -->
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" align="center" style="margin: 0 auto; max-width: 600px;">
                    
                    <!-- Header with EXL Branding -->
                    <tr>
                        <td style="padding-bottom: 24px;">
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #ffffff; border-radius: 8px 8px 0 0; border-bottom: 3px solid #FF6600;">
                                <tr>
                                    <td style="padding: 20px 24px;">
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                                            <tr>
                                                <td style="padding-right: 12px;">
                                                    <!-- EXL Logo Text -->
                                                    <span style="color: #FF6600; font-size: 28px; font-weight: bold; font-family: Arial, sans-serif; letter-spacing: -1px;">EXL</span>
                                                </td>
                                                <td style="border-left: 2px solid #E5E7EB; padding-left: 12px;">
                                                    <span style="color: #1F2937; font-size: 18px; font-weight: bold; font-family: Arial, sans-serif;">NOVA</span><span style="color: #6B7280; font-size: 12px; font-family: Arial, sans-serif;">.ai</span>
                                                    <span style="color: #6B7280; font-size: 12px; font-family: Arial, sans-serif; margin-left: 4px;">Workflow</span>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Main Content Card -->
                    <tr>
                        <td>
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                                
                                <!-- Accent Bar -->
                                <tr>
                                    <td style="height: 4px; background-color: {accent_color}; border-radius: 8px 8px 0 0;"></td>
                                </tr>
                                
                                <!-- Content -->
                                <tr>
                                    <td style="padding: 32px 40px 40px 40px;">
                                        {content}
                                        {button_html}
                                        {footer_note_html}
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding-top: 24px; text-align: center;">
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                <tr>
                                    <td align="center" style="padding-bottom: 16px;">
                                        <span style="color: #FF6600; font-size: 14px; font-weight: bold; font-family: Arial, sans-serif;">EXL</span>
                                        <span style="color: #9CA3AF; font-size: 12px; font-family: Arial, sans-serif;"> | Intelligent Automation Platform</span>
                                    </td>
                                </tr>
                                <tr>
                                    <td align="center">
                                        <p style="margin: 0 0 4px 0; color: #6B7280; font-size: 12px; font-family: Arial, sans-serif;">
                                            This is an automated message from NOVA.ai Workflow.
                                        </p>
                                        <p style="margin: 0; color: #9CA3AF; font-size: 11px; font-family: Arial, sans-serif;">
                                            © 2026 EXL Service. All rights reserved.
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                </table>
            </td>
        </tr>
    </table>
    
</body>
</html>
'''


# =============================================================================
# Icon Component - Outlook-compatible centered icon
# =============================================================================

def get_icon_block(emoji: str, bg_color: str = "#D1FAE5") -> str:
    """Generate an Outlook-compatible centered icon block"""
    return f'''
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
            <td align="center" style="padding-bottom: 24px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                    <tr>
                        <td style="background-color: {bg_color}; padding: 16px; text-align: center; width: 64px; height: 64px;">
                            <span style="font-size: 32px; line-height: 1;">{emoji}</span>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
    '''


# =============================================================================
# Info Card Component - Reusable ticket info display
# =============================================================================

def get_info_card(
    ticket_id: str,
    ticket_title: str,
    additional_fields: Optional[Dict[str, str]] = None
) -> str:
    """Generate a styled info card for ticket details - Outlook compatible"""
    
    fields_html = ""
    if additional_fields:
        for label, value in additional_fields.items():
            fields_html += f'''
            <tr>
                <td style="padding: 8px 16px; color: #6B7280; font-size: 13px; border-bottom: 1px solid #E5E7EB; font-family: Arial, sans-serif;">{label}</td>
                <td style="padding: 8px 16px; color: #111827; font-size: 13px; font-weight: bold; border-bottom: 1px solid #E5E7EB; font-family: Arial, sans-serif;">{value}</td>
            </tr>
            '''
    
    return f'''
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 24px 0; border: 1px solid #E5E7EB; background-color: #F9FAFB;">
        <tr>
            <td colspan="2" style="background-color: #EEF2FF; padding: 16px 20px; border-bottom: 1px solid #E5E7EB;">
                <p style="margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #6B7280; font-weight: bold; font-family: Arial, sans-serif;">
                    📋 TICKET DETAILS
                </p>
            </td>
        </tr>
        <tr>
            <td style="padding: 12px 16px; color: #6B7280; font-size: 13px; border-bottom: 1px solid #E5E7EB; width: 120px; font-family: Arial, sans-serif;">Ticket ID</td>
            <td style="padding: 12px 16px; font-size: 13px; border-bottom: 1px solid #E5E7EB; font-family: Arial, sans-serif;">
                <span style="background-color: #E0E7FF; color: #4338CA; padding: 2px 8px; font-size: 12px; font-family: Consolas, monospace;">{ticket_id}</span>
            </td>
        </tr>
        <tr>
            <td style="padding: 12px 16px; color: #6B7280; font-size: 13px; border-bottom: 1px solid #E5E7EB; font-family: Arial, sans-serif;">Title</td>
            <td style="padding: 12px 16px; color: #111827; font-size: 13px; font-weight: bold; border-bottom: 1px solid #E5E7EB; font-family: Arial, sans-serif;">{ticket_title}</td>
        </tr>
        {fields_html}
    </table>
    '''


# =============================================================================
# Individual Templates - Beautiful & Professional
# =============================================================================

def get_ticket_created_template(payload: Dict[str, Any], app_url: str = "") -> Dict[str, str]:
    """Template: Ticket Created - Confirmation to requester"""
    
    ticket_id = payload.get('ticket_id', '')
    ticket_title = payload.get('ticket_title', '')
    workflow_name = payload.get('workflow_name', '')
    
    info_card = get_info_card(
        ticket_id=ticket_id,
        ticket_title=ticket_title,
        additional_fields={"Workflow": workflow_name}
    )
    
    icon = get_icon_block("✅", "#D1FAE5")
    
    content = f'''
    {icon}
    
    <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold; color: #111827; text-align: center; font-family: Arial, sans-serif;">
        Ticket Created Successfully
    </h1>
    <p style="margin: 0 0 24px 0; color: #6B7280; text-align: center; font-size: 15px; font-family: Arial, sans-serif;">
        Your request has been submitted and is being processed.
    </p>
    
    {info_card}
    
    <p style="margin: 24px 0 0 0; color: #4B5563; font-size: 14px; line-height: 1.6; font-family: Arial, sans-serif;">
        We'll notify you when there are updates on your request. You can track the progress anytime by clicking the button below.
    </p>
    '''
    
    body = get_base_template(
        content=content,
        action_button_text="View Ticket Status",
        action_button_url=f"{app_url}/tickets/{ticket_id}",
        accent_color="#10B981"  # Green for success
    )
    
    return {
        "subject": f"✅ Ticket Created: {ticket_title}",
        "body": body
    }


def get_approval_pending_template(payload: Dict[str, Any], app_url: str = "") -> Dict[str, str]:
    """Template: Approval Pending - Request for manager/approver"""
    
    ticket_id = payload.get('ticket_id', '')
    ticket_title = payload.get('ticket_title', '')
    requester_name = payload.get('requester_name', 'A team member')
    requester_email = payload.get('requester_email', '')
    step_name = payload.get('step_name', '')
    branch_name = payload.get('branch_name', '')
    workflow_name = payload.get('workflow_name', '')
    
    additional_fields = {"Requested by": requester_name}
    if requester_email:
        additional_fields["Email"] = requester_email
    if workflow_name:
        additional_fields["Workflow"] = workflow_name
    if step_name:
        additional_fields["Current Step"] = step_name
    if branch_name:
        additional_fields["Branch"] = branch_name
    
    info_card = get_info_card(
        ticket_id=ticket_id,
        ticket_title=ticket_title,
        additional_fields=additional_fields
    )
    
    icon = get_icon_block("⏳", "#FEF3C7")
    
    content = f'''
    {icon}
    
    <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold; color: #111827; text-align: center; font-family: Arial, sans-serif;">
        Your Approval is Required
    </h1>
    <p style="margin: 0 0 24px 0; color: #6B7280; text-align: center; font-size: 15px; font-family: Arial, sans-serif;">
        {requester_name} has submitted a request that requires your review and approval.
    </p>
    
    {info_card}
    
    <p style="margin: 24px 0 0 0; color: #4B5563; font-size: 14px; line-height: 1.6; font-family: Arial, sans-serif;">
        Please review the request details carefully and take one of the following actions:
    </p>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 16px 0;">
        <tr>
            <td style="padding: 8px 0; font-family: Arial, sans-serif; font-size: 14px; color: #4B5563;">
                ✅ <strong>Approve</strong> - If the request meets all requirements and should proceed
            </td>
        </tr>
        <tr>
            <td style="padding: 8px 0; font-family: Arial, sans-serif; font-size: 14px; color: #4B5563;">
                ❌ <strong>Reject</strong> - If the request cannot be approved (please provide a reason)
            </td>
        </tr>
        <tr>
            <td style="padding: 8px 0; font-family: Arial, sans-serif; font-size: 14px; color: #4B5563;">
                ❓ <strong>Request Info</strong> - If you need additional information before deciding
            </td>
        </tr>
    </table>
    <p style="margin: 0; color: #6B7280; font-size: 13px; font-family: Arial, sans-serif;">
        The requester will be automatically notified of your decision.
    </p>
    '''
    
    body = get_base_template(
        content=content,
        action_button_text="Review Request",
        action_button_url=f"{app_url}/tickets/{ticket_id}",
        accent_color="#F59E0B",  # Amber for action required
        footer_note="This request is awaiting your response. Please review at your earliest convenience to avoid delays."
    )
    
    return {
        "subject": f"🔔 Action Required: {requester_name} needs your approval for '{ticket_title}'",
        "body": body
    }


def get_approval_reassigned_template(payload: Dict[str, Any], app_url: str = "") -> Dict[str, str]:
    """Template: Approval Reassigned - Notification to new approver"""
    
    ticket_id = payload.get('ticket_id', '')
    ticket_title = payload.get('ticket_title', '')
    reassigned_by_name = payload.get('reassigned_by_name', 'A team member')
    reassigned_by_email = payload.get('reassigned_by_email', '')
    reason = payload.get('reason', '')
    requester_name = payload.get('requester_name', '')
    
    additional_fields = {"Reassigned by": reassigned_by_name}
    if requester_name:
        additional_fields["Original Requester"] = requester_name
    if reason:
        additional_fields["Reason for Reassignment"] = reason
    
    info_card = get_info_card(
        ticket_id=ticket_id,
        ticket_title=ticket_title,
        additional_fields=additional_fields
    )
    
    icon = get_icon_block("🔄", "#DBEAFE")
    
    reason_section = ""
    if reason:
        reason_section = f'''
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 16px 0;">
        <tr>
            <td style="background-color: #F0F9FF; border-left: 4px solid #3B82F6; padding: 16px; font-family: Arial, sans-serif;">
                <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; color: #64748B; font-weight: bold;">Reassignment Note</p>
                <p style="margin: 0; font-size: 14px; color: #1E293B;">{reason}</p>
            </td>
        </tr>
    </table>
        '''
    
    content = f'''
    {icon}
    
    <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold; color: #1D4ED8; text-align: center; font-family: Arial, sans-serif;">
        Approval Request Reassigned to You
    </h1>
    <p style="margin: 0 0 24px 0; color: #6B7280; text-align: center; font-size: 15px; font-family: Arial, sans-serif;">
        {reassigned_by_name} has reassigned an approval request to you for review.
    </p>
    
    {info_card}
    {reason_section}
    
    <p style="margin: 24px 0 0 0; color: #4B5563; font-size: 14px; line-height: 1.6; font-family: Arial, sans-serif;">
        You are now the designated approver for this request. Please review the details and provide your decision at your earliest convenience. The requester will be notified once you take action.
    </p>
    '''
    
    body = get_base_template(
        content=content,
        action_button_text="Review Request",
        action_button_url=f"{app_url}/tickets/{ticket_id}",
        accent_color="#1D4ED8",  # Blue for reassignment
        footer_note="This approval has been reassigned to you. Your timely response is appreciated."
    )
    
    return {
        "subject": f"🔄 Approval Reassigned to You: {ticket_title}",
        "body": body
    }


def get_approved_template(payload: Dict[str, Any], app_url: str = "") -> Dict[str, str]:
    """Template: Approved - Notification to requester"""
    
    ticket_id = payload.get('ticket_id', '')
    ticket_title = payload.get('ticket_title', '')
    approver_name = payload.get('approver_name', 'A manager')
    comment = payload.get('comment', '')
    
    additional_fields = {"Approved by": approver_name}
    if comment:
        additional_fields["Comment"] = comment
    
    info_card = get_info_card(
        ticket_id=ticket_id,
        ticket_title=ticket_title,
        additional_fields=additional_fields
    )
    
    icon = get_icon_block("👍", "#D1FAE5")
    
    content = f'''
    {icon}
    
    <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold; color: #059669; text-align: center; font-family: Arial, sans-serif;">
        Request Approved!
    </h1>
    <p style="margin: 0 0 24px 0; color: #6B7280; text-align: center; font-size: 15px; font-family: Arial, sans-serif;">
        Great news! Your request has been approved and is moving forward.
    </p>
    
    {info_card}
    
    <p style="margin: 24px 0 0 0; color: #4B5563; font-size: 14px; line-height: 1.6; font-family: Arial, sans-serif;">
        Your request is now in progress. We'll notify you of any further updates or when additional actions are needed.
    </p>
    '''
    
    body = get_base_template(
        content=content,
        action_button_text="View Ticket",
        action_button_url=f"{app_url}/tickets/{ticket_id}",
        accent_color="#10B981"
    )
    
    return {
        "subject": f"✅ Approved: {ticket_title}",
        "body": body
    }


def get_rejected_template(payload: Dict[str, Any], app_url: str = "") -> Dict[str, str]:
    """Template: Rejected - Notification to requester"""
    
    ticket_id = payload.get('ticket_id', '')
    ticket_title = payload.get('ticket_title', '')
    approver_name = payload.get('approver_name', 'A manager')
    reason = payload.get('reason', 'No reason provided')
    
    info_card = get_info_card(
        ticket_id=ticket_id,
        ticket_title=ticket_title,
        additional_fields={
            "Rejected by": approver_name,
            "Reason": reason
        }
    )
    
    icon = get_icon_block("❌", "#FEE2E2")
    
    content = f'''
    {icon}
    
    <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold; color: #DC2626; text-align: center; font-family: Arial, sans-serif;">
        Request Not Approved
    </h1>
    <p style="margin: 0 0 24px 0; color: #6B7280; text-align: center; font-size: 15px; font-family: Arial, sans-serif;">
        Unfortunately, your request could not be approved at this time.
    </p>
    
    {info_card}
    
    <p style="margin: 24px 0 0 0; color: #4B5563; font-size: 14px; line-height: 1.6; font-family: Arial, sans-serif;">
        Please review the reason provided above. If you believe this was in error or have questions, please contact your manager directly.
    </p>
    '''
    
    body = get_base_template(
        content=content,
        action_button_text="View Details",
        action_button_url=f"{app_url}/tickets/{ticket_id}",
        accent_color="#EF4444"
    )
    
    return {
        "subject": f"❌ Request Not Approved: {ticket_title}",
        "body": body
    }


def get_skipped_template(payload: Dict[str, Any], app_url: str = "") -> Dict[str, str]:
    """Template: Skipped - Notification to requester when workflow is skipped"""
    
    ticket_id = payload.get('ticket_id', '')
    ticket_title = payload.get('ticket_title', '')
    approver_name = payload.get('approver_name', 'A manager')
    reason = payload.get('reason', 'No reason provided')
    
    info_card = get_info_card(
        ticket_id=ticket_id,
        ticket_title=ticket_title,
        additional_fields={
            "Skipped by": approver_name,
            "Reason": reason
        }
    )
    
    icon = get_icon_block("⏭️", "#FEF3C7")
    
    content = f'''
    {icon}
    
    <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold; color: #D97706; text-align: center; font-family: Arial, sans-serif;">
        Request Skipped
    </h1>
    <p style="margin: 0 0 24px 0; color: #6B7280; text-align: center; font-size: 15px; font-family: Arial, sans-serif;">
        Your request has been skipped and will not be processed further.
    </p>
    
    {info_card}
    
    <p style="margin: 24px 0 0 0; color: #4B5563; font-size: 14px; line-height: 1.6; font-family: Arial, sans-serif;">
        Please review the reason provided above. If you have questions, please contact your manager directly.
    </p>
    '''
    
    body = get_base_template(
        content=content,
        action_button_text="View Details",
        action_button_url=f"{app_url}/tickets/{ticket_id}",
        accent_color="#F59E0B"
    )
    
    return {
        "subject": f"⏭️ Request Skipped: {ticket_title}",
        "body": body
    }


def get_info_requested_template(payload: Dict[str, Any], app_url: str = "") -> Dict[str, str]:
    """Template: Info Requested - Request for additional information"""
    
    ticket_id = payload.get('ticket_id', '')
    ticket_title = payload.get('ticket_title', '')
    requestor_name = payload.get('requestor_name', 'Someone')
    subject = payload.get('subject', '')
    question = payload.get('question', '')
    attachment_count = payload.get('attachment_count', 0)
    
    subject_line = subject if subject else ticket_title
    
    additional_fields = {"From": requestor_name}
    if subject:
        additional_fields["Subject"] = subject
    
    info_card = get_info_card(
        ticket_id=ticket_id,
        ticket_title=ticket_title,
        additional_fields=additional_fields
    )
    
    attachment_note = ""
    if attachment_count > 0:
        attachment_note = f'''
        <p style="margin: 16px 0 0 0; padding: 12px 16px; background: #EEF2FF; border-radius: 8px; font-size: 13px; color: #4338CA;">
            📎 <strong>{attachment_count} attachment(s)</strong> included. Log in to view and download.
        </p>
        '''
    
    icon = get_icon_block("❓", "#DBEAFE")
    
    content = f'''
    {icon}
    
    <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold; color: #111827; text-align: center; font-family: Arial, sans-serif;">
        Information Requested
    </h1>
    <p style="margin: 0 0 24px 0; color: #6B7280; text-align: center; font-size: 15px; font-family: Arial, sans-serif;">
        Someone needs additional information to proceed with your request.
    </p>
    
    {info_card}
    
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 24px 0;">
        <tr>
            <td style="background-color: #F8FAFC; border-left: 4px solid #3B82F6; padding: 20px;">
                <p style="margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748B; font-weight: bold; font-family: Arial, sans-serif;">
                    Message
                </p>
                <p style="margin: 0; color: #1E293B; font-size: 15px; line-height: 1.6; font-family: Arial, sans-serif;">{question}</p>
            </td>
        </tr>
    </table>
    
    {attachment_note}
    
    <p style="margin: 24px 0 0 0; color: #4B5563; font-size: 14px; line-height: 1.6; font-family: Arial, sans-serif;">
        Please respond with the requested information as soon as possible to avoid delays in processing your request.
    </p>
    '''
    
    body = get_base_template(
        content=content,
        action_button_text="Respond Now",
        action_button_url=f"{app_url}/tickets/{ticket_id}",
        accent_color="#3B82F6",
        footer_note="Your response is required to continue processing this request."
    )
    
    return {
        "subject": f"❓ Information Needed: {subject_line}",
        "body": body
    }


def get_info_responded_template(payload: Dict[str, Any], app_url: str = "") -> Dict[str, str]:
    """Template: Info Response Received"""
    
    ticket_id = payload.get('ticket_id', '')
    ticket_title = payload.get('ticket_title', '')
    responder_name = payload.get('responder_name', 'The recipient')
    
    info_card = get_info_card(
        ticket_id=ticket_id,
        ticket_title=ticket_title,
        additional_fields={"Response from": responder_name}
    )
    
    icon = get_icon_block("💬", "#D1FAE5")
    
    content = f'''
    {icon}
    
    <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold; color: #111827; text-align: center; font-family: Arial, sans-serif;">
        Response Received
    </h1>
    <p style="margin: 0 0 24px 0; color: #6B7280; text-align: center; font-size: 15px; font-family: Arial, sans-serif;">
        The information you requested has been provided.
    </p>
    
    {info_card}
    
    <p style="margin: 24px 0 0 0; color: #4B5563; font-size: 14px; line-height: 1.6; font-family: Arial, sans-serif;">
        The response is available in the ticket. Please review and continue with your work.
    </p>
    '''
    
    body = get_base_template(
        content=content,
        action_button_text="View Response",
        action_button_url=f"{app_url}/tickets/{ticket_id}",
        accent_color="#10B981"
    )
    
    return {
        "subject": f"💬 Response Received: {ticket_title}",
        "body": body
    }


def get_task_assigned_template(payload: Dict[str, Any], app_url: str = "") -> Dict[str, str]:
    """Template: Task Assigned - Notification to agent"""
    
    ticket_id = payload.get('ticket_id', '')
    ticket_title = payload.get('ticket_title', '')
    assigned_by_name = payload.get('assigned_by_name', 'A manager')
    step_name = payload.get('step_name', '')
    due_date = payload.get('due_date', '')
    requester_name = payload.get('requester_name', '')
    workflow_name = payload.get('workflow_name', '')
    
    additional_fields = {"Assigned by": assigned_by_name}
    if requester_name:
        additional_fields["Requester"] = requester_name
    if workflow_name:
        additional_fields["Workflow"] = workflow_name
    if step_name:
        additional_fields["Task Name"] = step_name
    if due_date:
        additional_fields["Due Date"] = due_date
    
    info_card = get_info_card(
        ticket_id=ticket_id,
        ticket_title=ticket_title,
        additional_fields=additional_fields
    )
    
    icon = get_icon_block("📋", "#DBEAFE")
    
    due_warning = ""
    if due_date:
        due_warning = f'''
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 16px 0;">
        <tr>
            <td style="background-color: #FEF3C7; padding: 12px 16px; font-family: Arial, sans-serif;">
                <p style="margin: 0; font-size: 14px; color: #92400E;">
                    ⏰ <strong>Due Date:</strong> {due_date} - Please ensure timely completion.
                </p>
            </td>
        </tr>
    </table>
        '''
    
    content = f'''
    {icon}
    
    <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold; color: #111827; text-align: center; font-family: Arial, sans-serif;">
        New Task Assigned to You
    </h1>
    <p style="margin: 0 0 24px 0; color: #6B7280; text-align: center; font-size: 15px; font-family: Arial, sans-serif;">
        {assigned_by_name} has assigned you a new task to complete.
    </p>
    
    {info_card}
    {due_warning}
    
    <p style="margin: 24px 0 0 0; color: #4B5563; font-size: 14px; line-height: 1.6; font-family: Arial, sans-serif;">
        <strong>What you need to do:</strong>
    </p>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 8px 0;">
        <tr>
            <td style="padding: 6px 0; font-family: Arial, sans-serif; font-size: 14px; color: #4B5563;">
                1. Review the request details and requirements
            </td>
        </tr>
        <tr>
            <td style="padding: 6px 0; font-family: Arial, sans-serif; font-size: 14px; color: #4B5563;">
                2. Complete the assigned task
            </td>
        </tr>
        <tr>
            <td style="padding: 6px 0; font-family: Arial, sans-serif; font-size: 14px; color: #4B5563;">
                3. Mark as complete when finished
            </td>
        </tr>
    </table>
    <p style="margin: 16px 0 0 0; color: #6B7280; font-size: 13px; font-family: Arial, sans-serif;">
        If you need clarification or cannot complete this task, please use the "Request Handover" option.
    </p>
    '''
    
    body = get_base_template(
        content=content,
        action_button_text="Start Task",
        action_button_url=f"{app_url}/tickets/{ticket_id}",
        accent_color="#3B82F6",
        footer_note="Please complete this task before the due date to meet SLA requirements."
    )
    
    return {
        "subject": f"📋 New Task: {ticket_title} - Action Required",
        "body": body
    }


def get_sla_reminder_template(payload: Dict[str, Any], app_url: str = "") -> Dict[str, str]:
    """Template: SLA Reminder - Warning before breach"""
    
    ticket_id = payload.get('ticket_id', '')
    ticket_title = payload.get('ticket_title', '')
    step_name = payload.get('step_name', '')
    time_remaining = payload.get('time_remaining', 'soon')
    due_at = payload.get('due_at', '')
    
    additional_fields = {"Task": step_name}
    if due_at:
        additional_fields["Due At"] = due_at
    additional_fields["Time Remaining"] = time_remaining
    
    info_card = get_info_card(
        ticket_id=ticket_id,
        ticket_title=ticket_title,
        additional_fields=additional_fields
    )
    
    icon = get_icon_block("⏰", "#FEF3C7")
    
    content = f'''
    {icon}
    
    <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold; color: #D97706; text-align: center; font-family: Arial, sans-serif;">
        Deadline Approaching
    </h1>
    <p style="margin: 0 0 24px 0; color: #6B7280; text-align: center; font-size: 15px; font-family: Arial, sans-serif;">
        A task is approaching its SLA deadline.
    </p>
    
    {info_card}
    
    <p style="margin: 24px 0 0 0; color: #4B5563; font-size: 14px; line-height: 1.6; font-family: Arial, sans-serif;">
        Please prioritize this task to avoid an SLA breach. If you're unable to complete it on time, consider requesting a handover.
    </p>
    '''
    
    body = get_base_template(
        content=content,
        action_button_text="Complete Task Now",
        action_button_url=f"{app_url}/tickets/{ticket_id}",
        accent_color="#F59E0B",
        footer_note="Urgent: This task is due soon. Please take action immediately."
    )
    
    return {
        "subject": f"⏰ Reminder: Task Due Soon - {ticket_title}",
        "body": body
    }


def get_sla_escalation_template(payload: Dict[str, Any], app_url: str = "") -> Dict[str, str]:
    """Template: SLA Escalation - Task is overdue"""
    
    ticket_id = payload.get('ticket_id', '')
    ticket_title = payload.get('ticket_title', '')
    step_name = payload.get('step_name', '')
    overdue_hours = payload.get('overdue_hours', 0)
    assigned_to = payload.get('assigned_to', 'Unassigned')
    
    info_card = get_info_card(
        ticket_id=ticket_id,
        ticket_title=ticket_title,
        additional_fields={
            "Task": step_name,
            "Assigned To": assigned_to,
            "Overdue By": f"{overdue_hours} hours"
        }
    )
    
    icon = get_icon_block("🚨", "#FEE2E2")
    
    content = f'''
    {icon}
    
    <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold; color: #DC2626; text-align: center; font-family: Arial, sans-serif;">
        SLA Breached - Escalation
    </h1>
    <p style="margin: 0 0 24px 0; color: #6B7280; text-align: center; font-size: 15px; font-family: Arial, sans-serif;">
        A task has exceeded its SLA deadline and requires immediate attention.
    </p>
    
    {info_card}
    
    <p style="margin: 24px 0 0 0; color: #4B5563; font-size: 14px; line-height: 1.6; font-family: Arial, sans-serif;">
        This task is now overdue. Please take immediate action to resolve this issue. Manager intervention may be required.
    </p>
    '''
    
    body = get_base_template(
        content=content,
        action_button_text="Take Action Now",
        action_button_url=f"{app_url}/tickets/{ticket_id}",
        accent_color="#DC2626",
        footer_note="CRITICAL: This SLA has been breached. Immediate action is required."
    )
    
    return {
        "subject": f"🚨 ESCALATION: SLA Breached - {ticket_title}",
        "body": body
    }


def get_ticket_completed_template(payload: Dict[str, Any], app_url: str = "") -> Dict[str, str]:
    """Template: Ticket Completed - Final notification"""
    
    ticket_id = payload.get('ticket_id', '')
    ticket_title = payload.get('ticket_title', '')
    completion_time = payload.get('completion_time', '')
    
    additional_fields = {}
    if completion_time:
        additional_fields["Completed At"] = completion_time
    
    info_card = get_info_card(
        ticket_id=ticket_id,
        ticket_title=ticket_title,
        additional_fields=additional_fields if additional_fields else None
    )
    
    icon = get_icon_block("🎉", "#D1FAE5")
    
    content = f'''
    {icon}
    
    <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold; color: #059669; text-align: center; font-family: Arial, sans-serif;">
        Request Completed!
    </h1>
    <p style="margin: 0 0 24px 0; color: #6B7280; text-align: center; font-size: 15px; font-family: Arial, sans-serif;">
        Your request has been fully processed and completed.
    </p>
    
    {info_card}
    
    <p style="margin: 24px 0 0 0; color: #4B5563; font-size: 14px; line-height: 1.6; text-align: center; font-family: Arial, sans-serif;">
        Thank you for using NOVA.ai Workflow. If you have any questions about the outcome, please refer to the ticket details.
    </p>
    '''
    
    body = get_base_template(
        content=content,
        action_button_text="View Completed Ticket",
        action_button_url=f"{app_url}/tickets/{ticket_id}",
        accent_color="#10B981"
    )
    
    return {
        "subject": f"🎉 Completed: {ticket_title}",
        "body": body
    }


def get_ticket_cancelled_template(payload: Dict[str, Any], app_url: str = "") -> Dict[str, str]:
    """Template: Ticket Cancelled"""
    
    ticket_id = payload.get('ticket_id', '')
    ticket_title = payload.get('ticket_title', '')
    cancelled_by = payload.get('cancelled_by', '')
    reason = payload.get('reason', 'No reason provided')
    
    additional_fields = {"Reason": reason}
    if cancelled_by:
        additional_fields["Cancelled By"] = cancelled_by
    
    info_card = get_info_card(
        ticket_id=ticket_id,
        ticket_title=ticket_title,
        additional_fields=additional_fields
    )
    
    icon = get_icon_block("🚫", "#F3F4F6")
    
    content = f'''
    {icon}
    
    <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold; color: #6B7280; text-align: center; font-family: Arial, sans-serif;">
        Request Cancelled
    </h1>
    <p style="margin: 0 0 24px 0; color: #6B7280; text-align: center; font-size: 15px; font-family: Arial, sans-serif;">
        This request has been cancelled and is no longer active.
    </p>
    
    {info_card}
    
    <p style="margin: 24px 0 0 0; color: #4B5563; font-size: 14px; line-height: 1.6; font-family: Arial, sans-serif;">
        If you believe this was done in error or have questions, please contact your manager or submit a new request.
    </p>
    '''
    
    body = get_base_template(
        content=content,
        action_button_text="View Details",
        action_button_url=f"{app_url}/tickets/{ticket_id}",
        accent_color="#6B7280"
    )
    
    return {
        "subject": f"🚫 Cancelled: {ticket_title}",
        "body": body
    }


def get_form_pending_template(payload: Dict[str, Any], app_url: str = "") -> Dict[str, str]:
    """Template: Form Pending - Mid-workflow form required"""
    
    ticket_id = payload.get('ticket_id', '')
    ticket_title = payload.get('ticket_title', '')
    form_name = payload.get('form_name', 'Additional Information')
    
    info_card = get_info_card(
        ticket_id=ticket_id,
        ticket_title=ticket_title,
        additional_fields={"Form Required": form_name}
    )
    
    icon = get_icon_block("📝", "#E0E7FF")
    
    content = f'''
    {icon}
    
    <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold; color: #111827; text-align: center; font-family: Arial, sans-serif;">
        Form Required
    </h1>
    <p style="margin: 0 0 24px 0; color: #6B7280; text-align: center; font-size: 15px; font-family: Arial, sans-serif;">
        Additional information is needed to continue processing your request.
    </p>
    
    {info_card}
    
    <p style="margin: 24px 0 0 0; color: #4B5563; font-size: 14px; line-height: 1.6; font-family: Arial, sans-serif;">
        Please fill out the required form to proceed. Your request is on hold until this information is provided.
    </p>
    '''
    
    body = get_base_template(
        content=content,
        action_button_text="Fill Out Form",
        action_button_url=f"{app_url}/tickets/{ticket_id}",
        accent_color="#6366F1",
        footer_note="Your request cannot proceed until this form is completed."
    )
    
    return {
        "subject": f"📝 Form Required: {form_name} - {ticket_title}",
        "body": body
    }


def get_task_reassigned_template(payload: Dict[str, Any], app_url: str = "") -> Dict[str, str]:
    """Template: Task Reassigned"""
    
    ticket_id = payload.get('ticket_id', '')
    ticket_title = payload.get('ticket_title', '')
    previous_agent = payload.get('previous_agent', '')
    new_agent = payload.get('new_agent', '')
    reassigned_by = payload.get('reassigned_by', 'A manager')
    reason = payload.get('reason', '')
    
    additional_fields = {"Reassigned By": reassigned_by}
    if previous_agent:
        additional_fields["Previous Assignee"] = previous_agent
    if new_agent:
        additional_fields["New Assignee"] = new_agent
    
    info_card = get_info_card(
        ticket_id=ticket_id,
        ticket_title=ticket_title,
        additional_fields=additional_fields
    )
    
    icon = get_icon_block("🔄", "#DBEAFE")
    
    reason_section = ""
    if reason:
        reason_section = f'''
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 16px 0;">
        <tr>
            <td style="background-color: #F0F9FF; border-left: 4px solid #3B82F6; padding: 16px; font-family: Arial, sans-serif;">
                <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; color: #64748B; font-weight: bold;">Reason for Reassignment</p>
                <p style="margin: 0; font-size: 14px; color: #1E293B;">{reason}</p>
            </td>
        </tr>
    </table>
        '''
    
    content = f'''
    {icon}
    
    <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold; color: #111827; text-align: center; font-family: Arial, sans-serif;">
        Task Reassigned to You
    </h1>
    <p style="margin: 0 0 24px 0; color: #6B7280; text-align: center; font-size: 15px; font-family: Arial, sans-serif;">
        {reassigned_by} has reassigned a task to you for completion.
    </p>
    
    {info_card}
    {reason_section}
    
    <p style="margin: 24px 0 0 0; color: #4B5563; font-size: 14px; line-height: 1.6; font-family: Arial, sans-serif;">
        You are now responsible for completing this task. Please review the ticket history and any previous notes to understand the current status and requirements.
    </p>
    '''
    
    body = get_base_template(
        content=content,
        action_button_text="View Task Details",
        action_button_url=f"{app_url}/tickets/{ticket_id}",
        accent_color="#3B82F6"
    )
    
    return {
        "subject": f"🔄 Task Reassigned to You: {ticket_title}",
        "body": body
    }


def get_task_completed_template(payload: Dict[str, Any], app_url: str = "") -> Dict[str, str]:
    """Template: Task Completed - Notification that a task step finished"""
    
    ticket_id = payload.get('ticket_id', '')
    ticket_title = payload.get('ticket_title', '')
    step_name = payload.get('step_name', '')
    completed_by = payload.get('completed_by', '')
    
    additional_fields = {}
    if step_name:
        additional_fields["Task"] = step_name
    if completed_by:
        additional_fields["Completed By"] = completed_by
    
    info_card = get_info_card(
        ticket_id=ticket_id,
        ticket_title=ticket_title,
        additional_fields=additional_fields if additional_fields else None
    )
    
    icon = get_icon_block("✔️", "#D1FAE5")
    
    content = f'''
    {icon}
    
    <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold; color: #059669; text-align: center; font-family: Arial, sans-serif;">
        Task Completed
    </h1>
    <p style="margin: 0 0 24px 0; color: #6B7280; text-align: center; font-size: 15px; font-family: Arial, sans-serif;">
        A task has been successfully completed on your ticket.
    </p>
    
    {info_card}
    
    <p style="margin: 24px 0 0 0; color: #4B5563; font-size: 14px; line-height: 1.6;">
        The workflow is progressing. You'll be notified of any further updates.
    </p>
    '''
    
    body = get_base_template(
        content=content,
        action_button_text="View Ticket Progress",
        action_button_url=f"{app_url}/tickets/{ticket_id}",
        accent_color="#10B981"
    )
    
    return {
        "subject": f"✔️ Task Completed: {ticket_title}",
        "body": body
    }


def get_note_added_template(payload: Dict[str, Any], app_url: str = "") -> Dict[str, str]:
    """Template: Note Added - Notification when someone adds a note to a step"""
    
    ticket_id = payload.get('ticket_id', '')
    ticket_title = payload.get('ticket_title', '')
    step_name = payload.get('step_name', '')
    note_author = payload.get('note_author', 'Someone')
    note_preview = payload.get('note_preview', '')
    step_type = payload.get('step_type', 'step')
    
    # Truncate note preview if too long
    if len(note_preview) > 200:
        note_preview = note_preview[:200] + "..."
    
    additional_fields = {}
    if step_name:
        step_label = "Task" if step_type == "TASK_STEP" else "Approval Step" if step_type == "APPROVAL_STEP" else "Step"
        additional_fields[step_label] = step_name
    additional_fields["Added By"] = note_author
    
    info_card = get_info_card(
        ticket_id=ticket_id,
        ticket_title=ticket_title,
        additional_fields=additional_fields
    )
    
    icon = get_icon_block("💬", "#EDE9FE")
    
    # Note content display
    note_content_html = f'''
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 24px 0;">
        <tr>
            <td style="padding: 16px; background-color: #F8FAFC; border-radius: 8px; border-left: 4px solid #8B5CF6;">
                <p style="margin: 0 0 8px 0; font-size: 12px; color: #6B7280; font-family: Arial, sans-serif; text-transform: uppercase; letter-spacing: 0.5px;">
                    Note Content
                </p>
                <p style="margin: 0; font-size: 14px; color: #1F2937; font-family: Arial, sans-serif; line-height: 1.6; white-space: pre-wrap;">
                    {note_preview}
                </p>
            </td>
        </tr>
    </table>
    '''
    
    content = f'''
    {icon}
    
    <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold; color: #7C3AED; text-align: center; font-family: Arial, sans-serif;">
        New Note Added
    </h1>
    <p style="margin: 0 0 24px 0; color: #6B7280; text-align: center; font-size: 15px; font-family: Arial, sans-serif;">
        <strong>{note_author}</strong> added a note to your ticket.
    </p>
    
    {info_card}
    
    {note_content_html}
    
    <p style="margin: 24px 0 0 0; color: #4B5563; font-size: 14px; line-height: 1.6;">
        You can view the full conversation and respond directly in the application.
    </p>
    '''
    
    body = get_base_template(
        content=content,
        action_button_text="View Ticket",
        action_button_url=f"{app_url}/tickets/{ticket_id}?tab=activity",
        accent_color="#8B5CF6"
    )
    
    return {
        "subject": f"💬 New Note: {ticket_title}",
        "body": body
    }


def get_requester_note_added_template(payload: Dict[str, Any], app_url: str = "") -> Dict[str, str]:
    """Template: Requester Note Added - Notification when requester adds a note to their ticket"""
    
    ticket_id = payload.get('ticket_id', '')
    ticket_title = payload.get('ticket_title', '')
    requester_name = payload.get('requester_name', 'The Requester')
    note_preview = payload.get('note_preview', '')
    
    # Truncate note preview if too long
    if len(note_preview) > 200:
        note_preview = note_preview[:200] + "..."
    
    additional_fields = {
        "From": f"{requester_name} (Requester)",
        "Note Type": "Requester Update"
    }
    
    info_card = get_info_card(
        ticket_id=ticket_id,
        ticket_title=ticket_title,
        additional_fields=additional_fields
    )
    
    icon = get_icon_block("📝", "#D1FAE5")  # Green background for requester notes
    
    # Note content display
    note_content_html = f'''
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 24px 0;">
        <tr>
            <td style="padding: 16px; background-color: #ECFDF5; border-radius: 8px; border-left: 4px solid #10B981;">
                <p style="margin: 0 0 8px 0; font-size: 12px; color: #6B7280; font-family: Arial, sans-serif; text-transform: uppercase; letter-spacing: 0.5px;">
                    Requester's Note
                </p>
                <p style="margin: 0; font-size: 14px; color: #1F2937; font-family: Arial, sans-serif; line-height: 1.6; white-space: pre-wrap;">
                    {note_preview}
                </p>
            </td>
        </tr>
    </table>
    '''
    
    content = f'''
    {icon}
    
    <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold; color: #059669; text-align: center; font-family: Arial, sans-serif;">
        Requester Added a Note
    </h1>
    <p style="margin: 0 0 24px 0; color: #6B7280; text-align: center; font-size: 15px; font-family: Arial, sans-serif;">
        <strong>{requester_name}</strong> has added an update to their ticket.
    </p>
    
    {info_card}
    
    {note_content_html}
    
    <p style="margin: 24px 0 0 0; color: #4B5563; font-size: 14px; line-height: 1.6;">
        Please review this update and respond if necessary.
    </p>
    '''
    
    body = get_base_template(
        content=content,
        action_button_text="View Ticket",
        action_button_url=f"{app_url}/tickets/{ticket_id}?tab=messages",
        accent_color="#10B981"  # Green accent for requester notes
    )
    
    return {
        "subject": f"📝 Requester Update: {ticket_title}",
        "body": body
    }


# =============================================================================
# Template Registry - Get template by key
# =============================================================================

def get_lookup_user_assigned_template(payload: Dict[str, Any], app_url: str = "") -> Dict[str, str]:
    """Template: Lookup User Assigned - Notification when user is assigned via lookup table"""
    
    ticket_id = payload.get('ticket_id', '')
    ticket_title = payload.get('ticket_title', '')
    user_name = payload.get('user_name', '')
    is_primary = payload.get('is_primary', False)
    assigned_by = payload.get('assigned_by', 'The system')
    workflow_name = payload.get('workflow_name', '')
    
    role_text = "Primary Contact" if is_primary else "Team Member"
    role_color = "#059669" if is_primary else "#3B82F6"  # Green for primary, blue for secondary
    
    additional_fields = {
        "Your Role": role_text,
        "Assigned by": assigned_by
    }
    if workflow_name:
        additional_fields["Workflow"] = workflow_name
    
    info_card = get_info_card(
        ticket_id=ticket_id,
        ticket_title=ticket_title,
        additional_fields=additional_fields
    )
    
    icon = get_icon_block("👥", "#DBEAFE")
    
    role_badge = f'''
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 16px 0;">
        <tr>
            <td align="center">
                <span style="display: inline-block; background-color: {role_color}; color: white; padding: 6px 16px; border-radius: 20px; font-size: 13px; font-weight: 600; font-family: Arial, sans-serif;">
                    {role_text}
                </span>
            </td>
        </tr>
    </table>
    '''
    
    content = f'''
    {icon}
    
    <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold; color: #111827; text-align: center; font-family: Arial, sans-serif;">
        You've Been Assigned to a Request
    </h1>
    <p style="margin: 0 0 24px 0; color: #6B7280; text-align: center; font-size: 15px; font-family: Arial, sans-serif;">
        Hi {user_name or "there"}, you have been assigned as a {role_text.lower()} for this request.
    </p>
    
    {role_badge}
    
    {info_card}
    
    <p style="color: #6B7280; font-size: 14px; font-family: Arial, sans-serif; margin-top: 24px;">
        {"As the primary contact, you may be responsible for approving or managing this request." if is_primary else "You are receiving this notification for awareness. The primary contact will handle the main actions."}
    </p>
    '''
    
    return {
        "subject": f"[{role_text}] Assigned to: {ticket_title[:50]}{'...' if len(ticket_title) > 50 else ''}",
        "body": get_base_template(
            content=content,
            action_button_text="View Request",
            action_button_url=f"{app_url}/tickets/{ticket_id}",
            accent_color=role_color
        )
    }


# =============================================================================
# Change Request Templates
# =============================================================================

def get_change_request_pending_template(payload: Dict[str, Any], app_url: str = "") -> Dict[str, str]:
    """Template: Change Request Pending - To approver when CR is created"""
    
    ticket_id = payload.get('ticket_id', '')
    ticket_title = payload.get('ticket_title', '')
    change_request_id = payload.get('change_request_id', '')
    requester_name = payload.get('requester_name', 'A team member')
    reason = payload.get('reason', '')
    field_changes_count = payload.get('field_changes_count', 0)
    attachment_changes_count = payload.get('attachment_changes_count', 0)
    field_changes = payload.get('field_changes', [])
    
    additional_fields = {
        "Requested by": requester_name,
        "Reason": reason or "No reason provided",
        "Changes": f"{field_changes_count} field(s), {attachment_changes_count} attachment(s)"
    }
    
    info_card = get_info_card(
        ticket_id=ticket_id,
        ticket_title=ticket_title,
        additional_fields=additional_fields
    )
    
    # Build changes preview
    changes_html = ""
    if field_changes:
        changes_rows = ""
        for change in field_changes[:5]:  # Show max 5 changes
            old_val = str(change.get('old_value', '-'))[:30]
            new_val = str(change.get('new_value', '-'))[:30]
            changes_rows += f'''
            <tr>
                <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB; font-family: Arial, sans-serif; font-size: 13px;">{change.get('field_label', 'Field')}</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB; font-family: Arial, sans-serif; font-size: 13px; color: #DC2626; text-decoration: line-through;">{old_val}</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB; font-family: Arial, sans-serif; font-size: 13px; color: #059669; font-weight: 600;">{new_val}</td>
            </tr>
            '''
        if len(field_changes) > 5:
            changes_rows += f'''
            <tr>
                <td colspan="3" style="padding: 8px 12px; font-family: Arial, sans-serif; font-size: 13px; color: #6B7280; font-style: italic;">
                    ... and {len(field_changes) - 5} more change(s)
                </td>
            </tr>
            '''
        
        changes_html = f'''
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 24px 0; border: 1px solid #E5E7EB;">
            <tr>
                <td colspan="3" style="background-color: #FEF3C7; padding: 12px 16px; font-family: Arial, sans-serif; font-size: 12px; font-weight: bold; text-transform: uppercase; color: #92400E; border-bottom: 1px solid #E5E7EB;">
                    📝 Proposed Changes
                </td>
            </tr>
            <tr style="background-color: #F9FAFB;">
                <td style="padding: 8px 12px; font-family: Arial, sans-serif; font-size: 11px; font-weight: bold; color: #6B7280; border-bottom: 1px solid #E5E7EB;">FIELD</td>
                <td style="padding: 8px 12px; font-family: Arial, sans-serif; font-size: 11px; font-weight: bold; color: #6B7280; border-bottom: 1px solid #E5E7EB;">BEFORE</td>
                <td style="padding: 8px 12px; font-family: Arial, sans-serif; font-size: 11px; font-weight: bold; color: #6B7280; border-bottom: 1px solid #E5E7EB;">AFTER</td>
            </tr>
            {changes_rows}
        </table>
        '''
    
    icon = get_icon_block("📝", "#FEF3C7")
    
    content = f'''
    {icon}
    
    <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold; color: #111827; text-align: center; font-family: Arial, sans-serif;">
        Change Request Requires Your Approval
    </h1>
    <p style="margin: 0 0 24px 0; color: #6B7280; text-align: center; font-size: 15px; font-family: Arial, sans-serif;">
        {requester_name} has requested changes to an in-progress ticket.
    </p>
    
    {info_card}
    {changes_html}
    
    <p style="margin: 24px 0 0 0; color: #4B5563; font-size: 14px; line-height: 1.6; font-family: Arial, sans-serif;">
        Please review the proposed changes and take one of the following actions:
    </p>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 16px 0;">
        <tr>
            <td style="padding: 8px 0; font-family: Arial, sans-serif; font-size: 14px; color: #4B5563;">
                ✅ <strong>Approve</strong> - Accept the changes and update the ticket
            </td>
        </tr>
        <tr>
            <td style="padding: 8px 0; font-family: Arial, sans-serif; font-size: 14px; color: #4B5563;">
                ❌ <strong>Reject</strong> - Deny the changes (please provide a reason)
            </td>
        </tr>
    </table>
    '''
    
    body = get_base_template(
        content=content,
        action_button_text="Review Change Request",
        action_button_url=f"{app_url}/manager/change-requests",
        accent_color="#F59E0B",
        footer_note="This change request is awaiting your review in the CR Agent."
    )
    
    return {
        "subject": f"📝 Change Request: {requester_name} wants to modify '{ticket_title}'",
        "body": body
    }


def get_change_request_submitted_template(payload: Dict[str, Any], app_url: str = "") -> Dict[str, str]:
    """Template: Change Request Submitted - Confirmation to requester"""
    
    ticket_id = payload.get('ticket_id', '')
    ticket_title = payload.get('ticket_title', '')
    change_request_id = payload.get('change_request_id', '')
    assigned_to_name = payload.get('assigned_to_name', 'the approver')
    reason = payload.get('reason', '')
    field_changes_count = payload.get('field_changes_count', 0)
    attachment_changes_count = payload.get('attachment_changes_count', 0)
    
    additional_fields = {
        "CR ID": change_request_id,
        "Assigned To": assigned_to_name,
        "Changes Submitted": f"{field_changes_count} field(s), {attachment_changes_count} attachment(s)"
    }
    if reason:
        additional_fields["Your Reason"] = reason
    
    info_card = get_info_card(
        ticket_id=ticket_id,
        ticket_title=ticket_title,
        additional_fields=additional_fields
    )
    
    icon = get_icon_block("📤", "#DBEAFE")
    
    content = f'''
    {icon}
    
    <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold; color: #1D4ED8; text-align: center; font-family: Arial, sans-serif;">
        Change Request Submitted
    </h1>
    <p style="margin: 0 0 24px 0; color: #6B7280; text-align: center; font-size: 15px; font-family: Arial, sans-serif;">
        Your change request has been submitted and is pending approval.
    </p>
    
    {info_card}
    
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 24px 0;">
        <tr>
            <td style="background-color: #EEF2FF; border-left: 4px solid #3B82F6; padding: 16px; font-family: Arial, sans-serif;">
                <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold; color: #1E40AF;">📋 What happens next?</p>
                <p style="margin: 0; font-size: 14px; color: #3730A3; line-height: 1.6;">
                    <strong>{assigned_to_name}</strong> will review your requested changes. You'll receive a notification once they approve or reject your request.
                </p>
            </td>
        </tr>
    </table>
    
    <p style="margin: 16px 0 0 0; color: #4B5563; font-size: 14px; line-height: 1.6; font-family: Arial, sans-serif;">
        You can view the status of your change request anytime by visiting your ticket.
    </p>
    '''
    
    body = get_base_template(
        content=content,
        action_button_text="View Ticket",
        action_button_url=f"{app_url}/tickets/{ticket_id}",
        accent_color="#3B82F6"
    )
    
    return {
        "subject": f"📤 Change Request Submitted: {ticket_title}",
        "body": body
    }


def get_change_request_approved_template(payload: Dict[str, Any], app_url: str = "") -> Dict[str, str]:
    """Template: Change Request Approved - To requester when CR is approved"""
    
    ticket_id = payload.get('ticket_id', '')
    ticket_title = payload.get('ticket_title', '')
    approver_name = payload.get('approver_name', 'The approver')
    notes = payload.get('notes', '')
    field_changes_count = payload.get('field_changes_count', 0)
    new_version = payload.get('new_version', 2)
    
    additional_fields = {
        "Approved by": approver_name,
        "New Version": f"Version {new_version}",
        "Changes Applied": f"{field_changes_count} field(s) updated"
    }
    if notes:
        additional_fields["Approver Notes"] = notes
    
    info_card = get_info_card(
        ticket_id=ticket_id,
        ticket_title=ticket_title,
        additional_fields=additional_fields
    )
    
    icon = get_icon_block("✅", "#D1FAE5")
    
    content = f'''
    {icon}
    
    <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold; color: #059669; text-align: center; font-family: Arial, sans-serif;">
        Change Request Approved!
    </h1>
    <p style="margin: 0 0 24px 0; color: #6B7280; text-align: center; font-size: 15px; font-family: Arial, sans-serif;">
        Great news! Your requested changes have been approved and applied to the ticket.
    </p>
    
    {info_card}
    
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 24px 0;">
        <tr>
            <td style="background-color: #ECFDF5; border-left: 4px solid #10B981; padding: 16px; font-family: Arial, sans-serif;">
                <p style="margin: 0; font-size: 14px; color: #065F46; line-height: 1.6;">
                    ✅ The ticket has been updated to <strong>Version {new_version}</strong> with your changes. The workflow will continue with the updated information.
                </p>
            </td>
        </tr>
    </table>
    
    <p style="margin: 16px 0 0 0; color: #4B5563; font-size: 14px; line-height: 1.6; font-family: Arial, sans-serif;">
        You can view the updated ticket and version history anytime.
    </p>
    '''
    
    body = get_base_template(
        content=content,
        action_button_text="View Updated Ticket",
        action_button_url=f"{app_url}/tickets/{ticket_id}",
        accent_color="#10B981"
    )
    
    return {
        "subject": f"✅ Change Request Approved: {ticket_title}",
        "body": body
    }


def get_change_request_rejected_template(payload: Dict[str, Any], app_url: str = "") -> Dict[str, str]:
    """Template: Change Request Rejected - To requester when CR is rejected"""
    
    ticket_id = payload.get('ticket_id', '')
    ticket_title = payload.get('ticket_title', '')
    rejector_name = payload.get('rejector_name', 'The approver')
    notes = payload.get('notes', 'No reason provided')
    
    additional_fields = {
        "Rejected by": rejector_name,
        "Reason": notes
    }
    
    info_card = get_info_card(
        ticket_id=ticket_id,
        ticket_title=ticket_title,
        additional_fields=additional_fields
    )
    
    icon = get_icon_block("❌", "#FEE2E2")
    
    content = f'''
    {icon}
    
    <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold; color: #DC2626; text-align: center; font-family: Arial, sans-serif;">
        Change Request Not Approved
    </h1>
    <p style="margin: 0 0 24px 0; color: #6B7280; text-align: center; font-size: 15px; font-family: Arial, sans-serif;">
        Unfortunately, your change request could not be approved at this time.
    </p>
    
    {info_card}
    
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 24px 0;">
        <tr>
            <td style="background-color: #FEF2F2; border-left: 4px solid #EF4444; padding: 16px; font-family: Arial, sans-serif;">
                <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold; color: #991B1B;">Rejection Reason:</p>
                <p style="margin: 0; font-size: 14px; color: #7F1D1D; line-height: 1.6;">
                    {notes}
                </p>
            </td>
        </tr>
    </table>
    
    <p style="margin: 16px 0 0 0; color: #4B5563; font-size: 14px; line-height: 1.6; font-family: Arial, sans-serif;">
        The ticket will continue with its original data unchanged. If you believe this was in error or have questions, please contact the approver directly.
    </p>
    '''
    
    body = get_base_template(
        content=content,
        action_button_text="View Ticket",
        action_button_url=f"{app_url}/tickets/{ticket_id}",
        accent_color="#EF4444"
    )
    
    return {
        "subject": f"❌ Change Request Rejected: {ticket_title}",
        "body": body
    }


def get_change_request_cancelled_template(payload: Dict[str, Any], app_url: str = "") -> Dict[str, str]:
    """Template: Change Request Cancelled - To approver when requester cancels CR"""
    
    ticket_id = payload.get('ticket_id', '')
    ticket_title = payload.get('ticket_title', '')
    requester_name = payload.get('requester_name', 'The requester')
    change_request_id = payload.get('change_request_id', '')
    
    additional_fields = {
        "Cancelled by": requester_name,
        "CR ID": change_request_id
    }
    
    info_card = get_info_card(
        ticket_id=ticket_id,
        ticket_title=ticket_title,
        additional_fields=additional_fields
    )
    
    icon = get_icon_block("🚫", "#F3F4F6")
    
    content = f'''
    {icon}
    
    <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold; color: #6B7280; text-align: center; font-family: Arial, sans-serif;">
        Change Request Cancelled
    </h1>
    <p style="margin: 0 0 24px 0; color: #6B7280; text-align: center; font-size: 15px; font-family: Arial, sans-serif;">
        A pending change request has been cancelled by the requester.
    </p>
    
    {info_card}
    
    <p style="margin: 24px 0 0 0; color: #4B5563; font-size: 14px; line-height: 1.6; font-family: Arial, sans-serif;">
        <strong>{requester_name}</strong> has cancelled their change request. No action is required from you. The ticket will continue with its current data unchanged.
    </p>
    '''
    
    body = get_base_template(
        content=content,
        action_button_text="View Ticket",
        action_button_url=f"{app_url}/tickets/{ticket_id}",
        accent_color="#6B7280"
    )
    
    return {
        "subject": f"🚫 Change Request Cancelled: {ticket_title}",
        "body": body
    }


def get_workflow_paused_for_cr_template(payload: Dict[str, Any], app_url: str = "") -> Dict[str, str]:
    """Template: Workflow Paused for CR - To all parties when workflow paused"""
    
    ticket_id = payload.get('ticket_id', '')
    ticket_title = payload.get('ticket_title', '')
    requester_name = payload.get('requester_name', 'Someone')
    change_request_id = payload.get('change_request_id', '')
    paused_steps_count = payload.get('paused_steps_count', 0)
    paused_steps = payload.get('paused_steps', [])
    
    # Build paused steps list
    steps_html = ""
    if paused_steps:
        steps_list = ", ".join(paused_steps[:5])  # Show first 5 steps
        if len(paused_steps) > 5:
            steps_list += f" and {len(paused_steps) - 5} more"
        steps_html = f'<p style="margin: 8px 0 0 0; color: #6B7280; font-size: 13px; font-family: Arial, sans-serif;"><em>Paused steps: {steps_list}</em></p>'
    
    additional_fields = {
        "Requested by": requester_name,
        "CR ID": change_request_id,
        "Status": "⏸️ Paused"
    }
    
    info_card = get_info_card(
        ticket_id=ticket_id,
        ticket_title=ticket_title,
        additional_fields=additional_fields
    )
    
    icon = get_icon_block("⏸️", "#FEF3C7")
    
    content = f'''
    {icon}
    
    <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold; color: #F59E0B; text-align: center; font-family: Arial, sans-serif;">
        Workflow Paused
    </h1>
    <p style="margin: 0 0 24px 0; color: #6B7280; text-align: center; font-size: 15px; font-family: Arial, sans-serif;">
        A change request requires review before the workflow can continue.
    </p>
    
    {info_card}
    
    <p style="margin: 24px 0 0 0; color: #4B5563; font-size: 14px; line-height: 1.6; font-family: Arial, sans-serif;">
        <strong>{requester_name}</strong> has raised a change request that needs to be reviewed. 
        The workflow is paused until the change request is approved, rejected, or cancelled. 
        You will be notified when the workflow resumes.
    </p>
    {steps_html}
    '''
    
    body = get_base_template(
        content=content,
        action_button_text="View Ticket",
        action_button_url=f"{app_url}/tickets/{ticket_id}",
        accent_color="#F59E0B"
    )
    
    return {
        "subject": f"⏸️ Workflow Paused: {ticket_title}",
        "body": body
    }


def get_workflow_resumed_after_cr_template(payload: Dict[str, Any], app_url: str = "") -> Dict[str, str]:
    """Template: Workflow Resumed after CR - To all parties when workflow resumes"""
    
    ticket_id = payload.get('ticket_id', '')
    ticket_title = payload.get('ticket_title', '')
    resolver_name = payload.get('resolver_name', 'Someone')
    change_request_id = payload.get('change_request_id', '')
    resolution = payload.get('resolution', 'RESOLVED')
    resumed_steps_count = payload.get('resumed_steps_count', 0)
    
    # Determine icon and color based on resolution
    if resolution == "APPROVED":
        icon_emoji = "✅"
        bg_color = "#D1FAE5"
        accent_color = "#10B981"
        status_text = "Approved"
        resolution_message = "The change request was <strong>approved</strong> and the ticket data has been updated."
    elif resolution == "REJECTED":
        icon_emoji = "❌"
        bg_color = "#FEE2E2"
        accent_color = "#EF4444"
        status_text = "Rejected"
        resolution_message = "The change request was <strong>rejected</strong>. The original ticket data has been retained."
    else:  # CANCELLED
        icon_emoji = "🚫"
        bg_color = "#F3F4F6"
        accent_color = "#6B7280"
        status_text = "Cancelled"
        resolution_message = "The change request was <strong>cancelled</strong> by the requester. The original ticket data has been retained."
    
    additional_fields = {
        "Resolved by": resolver_name,
        "CR ID": change_request_id,
        "Resolution": f"{icon_emoji} {status_text}"
    }
    
    info_card = get_info_card(
        ticket_id=ticket_id,
        ticket_title=ticket_title,
        additional_fields=additional_fields
    )
    
    icon = get_icon_block("▶️", "#DBEAFE")
    
    content = f'''
    {icon}
    
    <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold; color: #3B82F6; text-align: center; font-family: Arial, sans-serif;">
        Workflow Resumed
    </h1>
    <p style="margin: 0 0 24px 0; color: #6B7280; text-align: center; font-size: 15px; font-family: Arial, sans-serif;">
        The workflow has resumed and is now active again.
    </p>
    
    {info_card}
    
    <p style="margin: 24px 0 0 0; color: #4B5563; font-size: 14px; line-height: 1.6; font-family: Arial, sans-serif;">
        {resolution_message} The workflow has now resumed and any pending actions can continue.
    </p>
    '''
    
    body = get_base_template(
        content=content,
        action_button_text="View Ticket",
        action_button_url=f"{app_url}/tickets/{ticket_id}",
        accent_color=accent_color
    )
    
    return {
        "subject": f"▶️ Workflow Resumed: {ticket_title}",
        "body": body
    }


TEMPLATE_REGISTRY = {
    EmailTemplateKey.TICKET_CREATED: get_ticket_created_template,
    EmailTemplateKey.APPROVAL_PENDING: get_approval_pending_template,
    EmailTemplateKey.APPROVAL_REASSIGNED: get_approval_reassigned_template,
    EmailTemplateKey.APPROVED: get_approved_template,
    EmailTemplateKey.REJECTED: get_rejected_template,
    EmailTemplateKey.SKIPPED: get_skipped_template,
    EmailTemplateKey.INFO_REQUESTED: get_info_requested_template,
    EmailTemplateKey.INFO_RESPONDED: get_info_responded_template,
    EmailTemplateKey.FORM_PENDING: get_form_pending_template,
    EmailTemplateKey.TASK_ASSIGNED: get_task_assigned_template,
    EmailTemplateKey.TASK_REASSIGNED: get_task_reassigned_template,
    EmailTemplateKey.TASK_COMPLETED: get_task_completed_template,
    EmailTemplateKey.NOTE_ADDED: get_note_added_template,
    EmailTemplateKey.REQUESTER_NOTE_ADDED: get_requester_note_added_template,
    EmailTemplateKey.SLA_REMINDER: get_sla_reminder_template,
    EmailTemplateKey.SLA_ESCALATION: get_sla_escalation_template,
    EmailTemplateKey.TICKET_CANCELLED: get_ticket_cancelled_template,
    EmailTemplateKey.TICKET_COMPLETED: get_ticket_completed_template,
    EmailTemplateKey.LOOKUP_USER_ASSIGNED: get_lookup_user_assigned_template,
    # Change Request templates
    EmailTemplateKey.CHANGE_REQUEST_PENDING: get_change_request_pending_template,
    EmailTemplateKey.CHANGE_REQUEST_SUBMITTED: get_change_request_submitted_template,
    EmailTemplateKey.CHANGE_REQUEST_APPROVED: get_change_request_approved_template,
    EmailTemplateKey.CHANGE_REQUEST_REJECTED: get_change_request_rejected_template,
    EmailTemplateKey.CHANGE_REQUEST_CANCELLED: get_change_request_cancelled_template,
    EmailTemplateKey.CHANGE_REQUEST_WORKFLOW_PAUSED: get_workflow_paused_for_cr_template,
    EmailTemplateKey.CHANGE_REQUEST_WORKFLOW_RESUMED: get_workflow_resumed_after_cr_template,
}


def get_email_template(
    template_key: str,
    payload: Dict[str, Any],
    app_url: str = ""
) -> Dict[str, str]:
    """
    Get rendered email template by key
    
    Args:
        template_key: Template identifier (from NotificationTemplateKey)
        payload: Data to populate the template
        app_url: Base URL for action buttons
        
    Returns:
        Dict with 'subject' and 'body' keys
    """
    try:
        key = EmailTemplateKey(template_key)
        template_func = TEMPLATE_REGISTRY.get(key)
        
        if template_func:
            return template_func(payload, app_url)
        
    except (ValueError, KeyError):
        pass
    
    # Fallback for unknown templates
    ticket_id = payload.get('ticket_id', '')
    fallback_url = f"{app_url}/tickets/{ticket_id}" if ticket_id else f"{app_url}/dashboard"
    
    return {
        "subject": f"[Notification] {payload.get('ticket_title', 'Update')}",
        "body": get_base_template(
            content=f"<p style='font-family: Arial, sans-serif;'>You have a new notification regarding your request.</p>",
            action_button_text="View Details",
            action_button_url=fallback_url
        )
    }
