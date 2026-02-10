"""
Run the FastAPI application with uvicorn.

Usage:
    python run.py
    python run.py --reload    # Development mode with auto-reload
    python run.py --port 8080 # Custom port
"""
import argparse
import uvicorn


def main():
    parser = argparse.ArgumentParser(description="Run the AI Ops Workflow API server")
    parser.add_argument(
        "--host",
        type=str,
        default="127.0.0.1",
        help="Host to bind to (default: 127.0.0.1)"
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="Port to bind to (default: 8000)"
    )
    parser.add_argument(
        "--reload",
        action="store_true",
        help="Enable auto-reload for development"
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=1,
        help="Number of worker processes (default: 1, ignored if --reload is set)"
    )
    
    args = parser.parse_args()
    
    print(f"Starting AI Ops Workflow API server...")
    print(f"  Host: {args.host}")
    print(f"  Port: {args.port}")
    print(f"  Reload: {args.reload}")
    if not args.reload and args.workers > 1:
        print(f"  Workers: {args.workers}")
    print()
    
    uvicorn.run(
        "app.main:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        workers=1 if args.reload else args.workers
    )


if __name__ == "__main__":
    main()
