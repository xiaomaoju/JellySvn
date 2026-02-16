import subprocess
import json
import sys
import os

def run_svn_command(command_args, cwd=None):
    try:
        # Construct command with mandatory flags
        # Use --no-auth-cache to ensure we are using the provided credentials
        # and not some cached (potentially broken) ones.
        mandatory_flags = ["--non-interactive", "--trust-server-cert", "--no-auth-cache"]
        
        # Insert flags before the first argument that looks like a target (starts without -)
        # or just append them if all are flags.
        full_cmd = ["svn"] + command_args + mandatory_flags
        
        result = subprocess.run(
            full_cmd,
            capture_output=True,
            text=True,
            check=True,
            cwd=cwd
        )
        return {"success": True, "output": result.stdout, "error": result.stderr}
    except subprocess.CalledProcessError as e:
        # Include both stdout and stderr in the error report
        return {
            "success": False, 
            "output": e.stdout, 
            "error": f"Command '{' '.join(e.cmd)}' failed with exit code {e.returncode}. Details: {e.stderr}"
        }
    except FileNotFoundError:
        return {"success": False, "error": "SVN command not found. Please ensure SVN is installed."}
    except Exception as e:
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No arguments provided"}))
        sys.exit(1)
    
    args = sys.argv[1:]
    cwd = None
    if "--cwd" in args:
        idx = args.index("--cwd")
        cwd = args[idx + 1]
        args = args[:idx] + args[idx + 2:]
    
    response = run_svn_command(args, cwd=cwd)
    print(json.dumps(response))
