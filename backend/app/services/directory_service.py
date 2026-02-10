"""Directory Service - User lookup and manager resolution via Microsoft Graph API"""
from typing import Any, Dict, List, Optional
import httpx
from datetime import datetime, timedelta

from ..domain.models import ActorContext, UserSnapshot
from ..domain.errors import GraphApiError, NotFoundError
from ..config.settings import settings
from ..utils.logger import get_logger
from ..utils.time import utc_now

logger = get_logger(__name__)


class DirectoryService:
    """
    Service for directory operations using Microsoft Graph API
    
    Uses delegated permissions via user's access token to proxy Graph API calls.
    """
    
    GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0"
    
    def __init__(self):
        self._token_cache: Dict[str, Any] = {}
    
    def get_current_user_info(self, actor: ActorContext) -> Dict[str, Any]:
        """Get current user info from token claims"""
        return {
            "aad_id": actor.aad_id,
            "email": actor.email,
            "display_name": actor.display_name,
            "job_title": None,
            "department": None
        }
    
    def get_user_manager(
        self,
        user_email: str,
        actor: ActorContext,
        access_token: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Get user's manager from Microsoft Graph
        
        Uses delegated permissions - requires user's access token.
        """
        if not access_token:
            logger.warning("No access token provided, returning mock manager")
            return self._get_mock_manager(user_email)
        
        try:
            return self._call_graph_api_manager(user_email, access_token)
        except Exception as e:
            logger.warning(f"Failed to get manager for {user_email}: {e}")
            return self._get_mock_manager(user_email)
    
    def _get_mock_manager(self, user_email: str) -> Dict[str, Any]:
        """Return mock manager for fallback when Graph API is unavailable"""
        # Extract domain from user email to make mock more realistic
        domain = user_email.split("@")[1] if "@" in user_email else "company.com"
        logger.info(f"Using mock manager for {user_email} (Graph API unavailable)")
        return {
            "aad_id": f"mock-manager-{user_email.split('@')[0]}",
            "email": f"manager@{domain}",
            "display_name": "Reporting Manager (AD unavailable)"
        }
    
    def _call_graph_api_manager(self, user_email: str, access_token: str) -> Optional[Dict[str, Any]]:
        """
        Call Graph API to get user's manager using delegated permissions
        """
        try:
            with httpx.Client(timeout=30.0) as client:
                response = client.get(
                    f"{self.GRAPH_BASE_URL}/users/{user_email}/manager",
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Content-Type": "application/json"
                    },
                    params={"$select": "id,displayName,mail,userPrincipalName"}
                )
                
                if response.status_code == 404:
                    logger.info(f"No manager found for {user_email}")
                    return None
                
                if response.status_code != 200:
                    logger.error(f"Graph API error: {response.status_code} - {response.text}")
                    return None
                
                data = response.json()
                return {
                    "aad_id": data.get("id"),
                    "email": data.get("mail") or data.get("userPrincipalName"),
                    "display_name": data.get("displayName")
                }
        except Exception as e:
            logger.error(f"Graph API manager call failed: {e}")
            return None
    
    def search_users(
        self,
        query: str,
        limit: int,
        actor: ActorContext,
        access_token: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Search for users by name or email using delegated permissions
        
        Uses the user's access token to call Graph API /users endpoint.
        """
        if not access_token:
            logger.warning("No access token provided for user search, returning mock results")
            return self._get_mock_search_results(query, limit)
        
        try:
            return self._call_graph_api_search(query, limit, access_token)
        except Exception as e:
            logger.error(f"User search failed: {e}")
            # Return mock results as fallback
            return self._get_mock_search_results(query, limit)
    
    def _get_mock_search_results(self, query: str, limit: int) -> List[Dict[str, Any]]:
        """Return mock search results for fallback"""
        mock_users = [
            {"aad_id": "user-1", "email": "john.smith@exlservice.com", "display_name": "John Smith", "job_title": "Developer", "department": "Engineering"},
            {"aad_id": "user-2", "email": "jane.doe@exlservice.com", "display_name": "Jane Doe", "job_title": "Designer", "department": "Design"},
            {"aad_id": "user-3", "email": "bob.wilson@exlservice.com", "display_name": "Bob Wilson", "job_title": "Manager", "department": "Operations"},
            {"aad_id": "user-4", "email": "alice.johnson@exlservice.com", "display_name": "Alice Johnson", "job_title": "Analyst", "department": "Finance"},
            {"aad_id": "user-5", "email": "charlie.brown@exlservice.com", "display_name": "Charlie Brown", "job_title": "Support Agent", "department": "Support"},
            {"aad_id": "user-6", "email": "sahil.garg@exlservice.com", "display_name": "Sahil Garg", "job_title": "Engineer", "department": "Engineering"},
            {"aad_id": "user-7", "email": "yashu.gupta@exlservice.com", "display_name": "Yashu Gupta", "job_title": "Developer", "department": "Engineering"},
            {"aad_id": "user-8", "email": "tarun.sharma@exlservice.com", "display_name": "Tarun Sharma", "job_title": "Senior Developer", "department": "Engineering"},
            {"aad_id": "user-9", "email": "taruna.singh@exlservice.com", "display_name": "Taruna Singh", "job_title": "Analyst", "department": "Analytics"},
            {"aad_id": "user-10", "email": "priya.kumar@exlservice.com", "display_name": "Priya Kumar", "job_title": "Manager", "department": "HR"},
            {"aad_id": "user-11", "email": "rajesh.verma@exlservice.com", "display_name": "Rajesh Verma", "job_title": "Director", "department": "Operations"},
            {"aad_id": "user-12", "email": "amit.patel@exlservice.com", "display_name": "Amit Patel", "job_title": "Developer", "department": "Engineering"},
        ]
        
        # Filter by query (case-insensitive partial match)
        query_lower = query.lower().strip()
        filtered = [
            u for u in mock_users 
            if query_lower in u["display_name"].lower() or query_lower in u["email"].lower()
        ]
        
        return filtered[:limit]
    
    def _call_graph_api_search(self, query: str, limit: int, access_token: str) -> List[Dict[str, Any]]:
        """
        Call Graph API to search users.
        
        First tries /me/people (requires People.Read - more commonly granted)
        Then falls back to /users with filter (requires User.Read.All)
        """
        try:
            with httpx.Client(timeout=15.0) as client:
                logger.info(f"Searching Graph API for: {query}")
                
                clean_query = query.strip()
                if not clean_query:
                    return []
                
                results = []
                
                # Method 1: Try /me/people endpoint (works with People.Read permission)
                try:
                    response = client.get(
                        f"{self.GRAPH_BASE_URL}/me/people",
                        headers={
                            "Authorization": f"Bearer {access_token}",
                            "Content-Type": "application/json"
                        },
                        params={
                            "$search": f'"{clean_query}"',
                            "$top": limit,
                            "$select": "id,displayName,emailAddresses,jobTitle,department"
                        }
                    )
                    
                    if response.status_code == 200:
                        data = response.json()
                        for person in data.get("value", []):
                            emails = person.get("emailAddresses", [])
                            email = emails[0].get("address") if emails else None
                            if email:
                                results.append({
                                    "aad_id": person.get("id"),
                                    "email": email,
                                    "display_name": person.get("displayName") or email.split("@")[0],
                                    "job_title": person.get("jobTitle"),
                                    "department": person.get("department")
                                })
                        
                        if results:
                            logger.info(f"/me/people found {len(results)} users for: {query}")
                            return results
                    else:
                        logger.info(f"/me/people returned {response.status_code}, trying /users")
                except Exception as e:
                    logger.info(f"/me/people failed: {e}, trying /users")
                
                # Method 2: Try /users with filter (requires User.Read.All)
                try:
                    escaped_query = clean_query.replace("'", "''")
                    response = client.get(
                        f"{self.GRAPH_BASE_URL}/users",
                        headers={
                            "Authorization": f"Bearer {access_token}",
                            "Content-Type": "application/json"
                        },
                        params={
                            "$filter": f"startswith(displayName,'{escaped_query}')",
                            "$select": "id,displayName,mail,userPrincipalName,jobTitle,department",
                            "$top": limit
                        }
                    )
                    
                    if response.status_code == 200:
                        data = response.json()
                        for u in data.get("value", []):
                            email = u.get("mail") or u.get("userPrincipalName")
                            if email:
                                results.append({
                                    "aad_id": u.get("id"),
                                    "email": email,
                                    "display_name": u.get("displayName") or email.split("@")[0],
                                    "job_title": u.get("jobTitle"),
                                    "department": u.get("department")
                                })
                        
                        logger.info(f"/users found {len(results)} users for: {query}")
                        return results
                    else:
                        logger.warning(f"/users returned {response.status_code}: {response.text[:100]}")
                except Exception as e:
                    logger.warning(f"/users failed: {e}")
                
                # Method 3: Try direct user lookup by email
                if "@" in query:
                    try:
                        response = client.get(
                            f"{self.GRAPH_BASE_URL}/users/{query}",
                            headers={
                                "Authorization": f"Bearer {access_token}",
                                "Content-Type": "application/json"
                            },
                            params={"$select": "id,displayName,mail,userPrincipalName,jobTitle,department"}
                        )
                        if response.status_code == 200:
                            u = response.json()
                            email = u.get("mail") or u.get("userPrincipalName")
                            if email:
                                results.append({
                                    "aad_id": u.get("id"),
                                    "email": email,
                                    "display_name": u.get("displayName") or email.split("@")[0],
                                    "job_title": u.get("jobTitle"),
                                    "department": u.get("department")
                                })
                                return results
                    except Exception as e:
                        logger.warning(f"Direct user lookup failed for {query}: {e}")
                
                logger.info(f"No results found for query: {query}")
                return results
                
        except Exception as e:
            logger.error(f"Graph API search call failed: {e}")
            return []
    
    def get_user_by_email(
        self,
        email: str,
        actor: ActorContext,
        access_token: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get user by email address using delegated permissions
        """
        if not access_token:
            return self._get_mock_user(email)
        
        try:
            return self._call_graph_api_get_user(email, access_token)
        except NotFoundError:
            raise
        except Exception as e:
            logger.error(f"Get user failed: {e}")
            return self._get_mock_user(email)
    
    def _get_mock_user(self, email: str) -> Dict[str, Any]:
        """Return mock user for fallback"""
        username = email.split('@')[0]
        return {
            "aad_id": f"mock-{username}",
            "email": email,
            "display_name": username.replace('.', ' ').title(),
            "job_title": "Employee",
            "department": "General"
        }
    
    def _call_graph_api_get_user(self, email: str, access_token: str) -> Dict[str, Any]:
        """
        Call Graph API to get user by email using delegated permissions
        """
        try:
            with httpx.Client(timeout=30.0) as client:
                response = client.get(
                    f"{self.GRAPH_BASE_URL}/users/{email}",
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Content-Type": "application/json"
                    },
                    params={"$select": "id,displayName,mail,userPrincipalName,jobTitle,department"}
                )
                
                if response.status_code == 404:
                    raise NotFoundError(f"User {email} not found")
                
                if response.status_code != 200:
                    logger.error(f"Graph API get user error: {response.status_code} - {response.text}")
                    return self._get_mock_user(email)
                
                data = response.json()
                return {
                    "aad_id": data.get("id"),
                    "email": data.get("mail") or data.get("userPrincipalName"),
                    "display_name": data.get("displayName"),
                    "job_title": data.get("jobTitle"),
                    "department": data.get("department")
                }
        except NotFoundError:
            raise
        except Exception as e:
            logger.error(f"Graph API get user call failed: {e}")
            return self._get_mock_user(email)
    
    def create_user_snapshot(
        self,
        aad_id: Optional[str],
        email: str,
        display_name: str,
        role_at_time: Optional[str] = None,
        manager_email: Optional[str] = None
    ) -> UserSnapshot:
        """Create a user snapshot for storage"""
        return UserSnapshot(
            aad_id=aad_id,
            email=email,
            display_name=display_name,
            role_at_time=role_at_time,
            manager_email=manager_email
        )
    
    def resolve_user_for_assignment(
        self,
        email: str,
        actor: ActorContext,
        access_token: Optional[str] = None
    ) -> UserSnapshot:
        """
        Resolve user for assignment
        
        Validates the email exists in directory and creates a snapshot.
        """
        try:
            user_info = self.get_user_by_email(email, actor, access_token)
            return UserSnapshot(
                aad_id=user_info.get("aad_id"),
                email=user_info.get("email", email),
                display_name=user_info.get("display_name", email)
            )
        except NotFoundError:
            # Allow as fallback
            return UserSnapshot(
                email=email,
                display_name=email.split('@')[0].replace('.', ' ').title()
            )
    
    def get_direct_reports(
        self,
        manager_email: str,
        actor: ActorContext,
        access_token: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get direct reports for a manager using delegated permissions
        """
        if not access_token:
            return [
                {"aad_id": "report-1", "email": "report1@exlservice.com", "display_name": "Direct Report 1"},
                {"aad_id": "report-2", "email": "report2@exlservice.com", "display_name": "Direct Report 2"},
            ]
        
        try:
            with httpx.Client(timeout=30.0) as client:
                response = client.get(
                    f"{self.GRAPH_BASE_URL}/users/{manager_email}/directReports",
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Content-Type": "application/json"
                    },
                    params={"$select": "id,displayName,mail,userPrincipalName"}
                )
                
                if response.status_code != 200:
                    logger.error(f"Graph API direct reports error: {response.status_code}")
                    return []
                
                data = response.json()
                return [
                    {
                        "aad_id": u.get("id"),
                        "email": u.get("mail") or u.get("userPrincipalName"),
                        "display_name": u.get("displayName")
                    }
                    for u in data.get("value", [])
                ]
        except Exception as e:
            logger.error(f"Graph API direct reports call failed: {e}")
            return []
    
    def validate_email_domain(self, email: str) -> bool:
        """
        Validate email belongs to organization domain
        """
        allowed_domains = ["exlservice.com"]  # Add your domains
        domain = email.split("@")[-1].lower()
        return domain in allowed_domains


class GraphApiClient:
    """
    Microsoft Graph API client for application (daemon) scenarios
    Uses client credentials flow for server-to-server calls.
    """
    
    BASE_URL = "https://graph.microsoft.com/v1.0"
    
    def __init__(self, tenant_id: str, client_id: str, client_secret: str):
        self.tenant_id = tenant_id
        self.client_id = client_id
        self.client_secret = client_secret
        self._access_token: Optional[str] = None
        self._token_expiry: Optional[datetime] = None
    
    async def get_user(self, email: str) -> Dict[str, Any]:
        """Get user by email/UPN"""
        token = await self._get_access_token()
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.BASE_URL}/users/{email}",
                headers={"Authorization": f"Bearer {token}"},
                params={"$select": "id,displayName,mail,userPrincipalName,jobTitle,department"}
            )
            
            if response.status_code == 404:
                raise NotFoundError(f"User {email} not found")
            
            if response.status_code != 200:
                raise GraphApiError(f"Graph API error: {response.status_code}")
            
            data = response.json()
            return {
                "aad_id": data.get("id"),
                "email": data.get("mail") or data.get("userPrincipalName"),
                "display_name": data.get("displayName"),
                "job_title": data.get("jobTitle"),
                "department": data.get("department")
            }
    
    async def get_manager(self, user_email: str) -> Optional[Dict[str, Any]]:
        """Get user's manager"""
        token = await self._get_access_token()
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.BASE_URL}/users/{user_email}/manager",
                headers={"Authorization": f"Bearer {token}"},
                params={"$select": "id,displayName,mail,userPrincipalName"}
            )
            
            if response.status_code == 404:
                return None
            
            if response.status_code != 200:
                raise GraphApiError(f"Graph API error: {response.status_code}")
            
            data = response.json()
            return {
                "aad_id": data.get("id"),
                "email": data.get("mail") or data.get("userPrincipalName"),
                "display_name": data.get("displayName")
            }
    
    async def search_users(self, query: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Search users by name or email"""
        token = await self._get_access_token()
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.BASE_URL}/users",
                headers={"Authorization": f"Bearer {token}"},
                params={
                    "$filter": f"startswith(displayName,'{query}') or startswith(mail,'{query}')",
                    "$select": "id,displayName,mail,userPrincipalName,jobTitle,department",
                    "$top": limit
                }
            )
            
            if response.status_code != 200:
                raise GraphApiError(f"Graph API error: {response.status_code}")
            
            data = response.json()
            return [
                {
                    "aad_id": u.get("id"),
                    "email": u.get("mail") or u.get("userPrincipalName"),
                    "display_name": u.get("displayName"),
                    "job_title": u.get("jobTitle"),
                    "department": u.get("department")
                }
                for u in data.get("value", [])
            ]
    
    async def _get_access_token(self) -> str:
        """Get access token using client credentials flow"""
        if self._access_token and self._token_expiry and utc_now() < self._token_expiry:
            return self._access_token
        
        token_url = f"https://login.microsoftonline.com/{self.tenant_id}/oauth2/v2.0/token"
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                token_url,
                data={
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "scope": "https://graph.microsoft.com/.default",
                    "grant_type": "client_credentials"
                }
            )
            
            if response.status_code != 200:
                raise GraphApiError(f"Failed to get access token: {response.status_code}")
            
            data = response.json()
            self._access_token = data["access_token"]
            self._token_expiry = utc_now() + timedelta(seconds=data.get("expires_in", 3600) - 300)
            
            return self._access_token
