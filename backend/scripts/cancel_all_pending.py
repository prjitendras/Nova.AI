"""Script to cancel all in-progress tickets"""
from datetime import datetime, timezone
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.repositories.ticket_repo import TicketRepository

def main():
    repo = TicketRepository()
    
    # Get all in-progress tickets (status is uppercase in DB)
    tickets = list(repo._tickets.find({'status': 'IN_PROGRESS'}))
    print(f'Found {len(tickets)} tickets in progress')
    
    if len(tickets) == 0:
        print('No tickets to cancel')
        return
    
    # Update each to cancelled
    cancelled_count = 0
    for ticket in tickets:
        tid = ticket['ticket_id']
        result = repo._tickets.update_one(
            {'ticket_id': tid},
            {'$set': {
                'status': 'CANCELLED',
                'updated_at': datetime.now(timezone.utc),
                'cancelled_at': datetime.now(timezone.utc),
                'cancellation_reason': 'Bulk cleanup'
            }}
        )
        if result.modified_count > 0:
            cancelled_count += 1
            print(f'Cancelled: {tid}')
    
    print(f'\nTotal cancelled: {cancelled_count}')

if __name__ == '__main__':
    main()
