from playwright.sync_api import sync_playwright

def test_port(port, username, password):
    results = {"port": port, "login_success": False, "openchamber_access": False, "title": None, "error": None}
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        try:
            page.goto(f'http://localhost:{port}')
            page.wait_for_load_state('networkidle')
            page.screenshot(path=f'/tmp/port_{port}_home.png')
            
            results["title"] = page.title()
            
            # Check if login required
            login_forms = page.locator('form').all()
            if login_forms:
                # Try to login
                page.fill('input[type="text"], input[name="username"], input[id="username"], input[type="email"]', username)
                page.fill('input[type="password"], input[name="password"], input[id="password"]', password)
                page.click('button[type="submit"], button:has-text("Login"), button:has-text("Войти"), button:has-text("Sign")')
                page.wait_for_load_state('networkidle')
                page.screenshot(path=f'/tmp/port_{port}_after_login.png')
                results["login_success"] = True
            
            # Look for openchamber - check both links and page title
            content = page.content().lower()
            if 'openchamber' in results["title"].lower() or 'openchamber' in content:
                results["openchamber_access"] = True
            
            # Also check for links/buttons with openchamber
            openchamber_links = page.locator('a:has-text("openchamber"), a:has-text("OpenChamber"), button:has-text("openchamber"), a:has-text("Open")').all()
            if openchamber_links:
                results["openchamber_access"] = True
                try:
                    openchamber_links[0].click()
                    page.wait_for_load_state('networkidle')
                    page.screenshot(path=f'/tmp/port_{port}_openchamber.png')
                except:
                    pass
            
        except Exception as e:
            results["error"] = str(e)
        
        browser.close()
    
    return results

if __name__ == "__main__":
    username = "admin"
    password = "qwe321"
    
    print("Testing port 8123...")
    result_8123 = test_port(8123, username, password)
    print(f"Port 8123: {result_8123}")
    
    print("\nTesting port 11001...")
    result_11001 = test_port(11001, username, password)
    print(f"Port 11001: {result_11001}")
    
    print("\n" + "="*50)
    print("COMPARISON")
    print("="*50)
    print(f"Port 8123 (MultiChamber):")
    print(f"  - Title: {result_8123['title']}")
    print(f"  - Login: {result_8123['login_success']}")
    print(f"  - OpenChamber access: {result_8123['openchamber_access']}")
    print(f"\nPort 11001 (OpenChamber direct):")
    print(f"  - Title: {result_11001['title']}")
    print(f"  - Login: {result_11001['login_success']}")
    print(f"  - OpenChamber access: {result_11001['openchamber_access']}")
