# backend/modules/ai_engine.py
# =============================================================
# DRPE - AI & Intelligence Module
# Powered by Dynamic Gemini Engine
# =============================================================
import google.generativeai as genai
import structlog
import asyncio
import httpx
import json
import re
from config import settings

logger = structlog.get_logger()

class AIEngine:
    def __init__(self):
        self.api_key = settings.GOOGLE_API_KEY
        self.provider = settings.AI_PROVIDER.lower()
        self._available_models = []
        
        if self.provider == "gemini" and self.api_key:
            try:
                genai.configure(api_key=self.api_key)
                logger.info("AI Engine: Gemini initialized")
            except Exception as e:
                logger.error("AI Engine: Gemini initialization failed", error=str(e))
        elif self.provider == "ollama":
            logger.info("AI Engine: Ollama provider selected", base_url=settings.OLLAMA_BASE_URL, model=settings.OLLAMA_MODEL)

    async def _get_best_model(self, custom_key: str = None):
        """
        Dynamically detects available models for the current API key (Gemini only).
        """
        if self.provider == "ollama":
            return settings.OLLAMA_MODEL

        # If we already have a cached model name, use it to save time
        if hasattr(self, '_cached_model') and self._cached_model and not custom_key:
            return self._cached_model

        sdk = genai
        if custom_key:
            sdk.configure(api_key=custom_key)
            
        try:
            def discover():
                return [m.name for m in sdk.list_models() 
                        if 'generateContent' in m.supported_generation_methods]
            
            models = await asyncio.to_thread(discover)
            if models:
                flash_models = [m for m in models if 'flash' in m.lower()]
                best_model = flash_models[0] if flash_models else models[0]
                
                if not custom_key:
                    self._cached_model = best_model
                return best_model
        except Exception as e:
            logger.error("AI Engine: Model discovery failed", error=str(e))
        
        return 'gemini-1.5-flash'

    async def _ollama_generate_content(self, prompt: str) -> str:
        """
        Generate content using local Ollama instance.
        """
        url = f"{settings.OLLAMA_BASE_URL}/api/generate"
        payload = {
            "model": settings.OLLAMA_MODEL,
            "prompt": prompt,
            "stream": False
        }
        
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(url, json=payload)
                response.raise_for_status()
                data = response.json()
                return data.get("response", "No response from Ollama")
        except Exception as e:
            logger.error("AI Engine: Ollama generation failed", error=str(e))
            return f"Ollama Intelligence Fault: {str(e)}. Ensure Ollama is running at {settings.OLLAMA_BASE_URL}"

    async def _safe_generate_content(self, prompt: str, custom_key: str = None) -> str:
        """
        Routes the generation request to the selected provider.
        """
        # If user provides a custom key, always use Gemini
        if custom_key:
            return await self._gemini_generate_content(prompt, custom_key)
            
        if self.provider == "ollama":
            return await self._ollama_generate_content(prompt)
        else:
            return await self._gemini_generate_content(prompt)

    async def _gemini_generate_content(self, prompt: str, custom_key: str = None) -> str:
        model_name = await self._get_best_model(custom_key)
        logger.info("AI Engine: Using Gemini model", model=model_name)
        
        try:
            model = genai.GenerativeModel(model_name)
            response = await asyncio.to_thread(model.generate_content, prompt)
            return response.text
        except Exception as e:
            logger.error("AI Engine: Gemini generation failed", model=model_name, error=str(e))
            return f"Gemini Intelligence Handshake Failure: {str(e)}"

    async def analyze_vulnerability(self, vuln_data: dict, custom_key: str = None) -> str:
        """
        Generate a detailed security analysis for a specific vulnerability.
        """
        prompt = f"""
        You are a senior Cybersecurity Intelligence Analyst at DRPE. 
        Perform a deep dive analysis of the following vulnerability:
        
        CVE ID: {vuln_data.get('cve_id', 'N/A')}
        Vulnerability Name: {vuln_data.get('name', 'N/A')}
        Severity: {vuln_data.get('severity', 'N/A')}
        Description: {vuln_data.get('description', 'N/A')}
        
        Provide your analysis in Markdown format with sections for Summary, Impact, and Mitigation.
        Avoid verbose introductions.
        """
        return await self._safe_generate_content(prompt, custom_key)

    async def generate_chat_reply(self, message: str, history: list = None, system_prompt: str = "", custom_key: str = None) -> str:
        """
        Generate a multi-turn chat reply.
        """
        full_prompt = f"{system_prompt}\n\nUser Question: {message}"
        return await self._safe_generate_content(full_prompt, custom_key)

    async def generate_chat_stream(self, message: str, history: list = None, system_prompt: str = "", custom_key: str = None):
        """
        Stream the chat reply with automatic retry for 503/temporary errors.
        """
        max_retries = 3
        retry_delay = 1.0

        for attempt in range(max_retries):
            try:
                if custom_key or self.provider != "ollama":
                    model_name = await self._get_best_model(custom_key)
                    model = genai.GenerativeModel(
                        model_name=model_name,
                        system_instruction=system_prompt if system_prompt else None
                    )
                    chat = model.start_chat(history=history or [])
                    
                    response = await chat.send_message_async(message, stream=True)
                    async for chunk in response:
                        if chunk.text:
                            yield chunk.text
                    return # Success
                else:
                    # Ollama streaming
                    url = f"{settings.OLLAMA_BASE_URL}/api/generate"
                    full_prompt = f"{system_prompt}\n\nUser Question: {message}"
                    payload = {"model": settings.OLLAMA_MODEL, "prompt": full_prompt, "stream": True}
                    
                    async with httpx.AsyncClient(timeout=60.0) as client:
                        async with client.stream("POST", url, json=payload) as response:
                            async for line in response.aiter_lines():
                                if line:
                                    data = json.loads(line)
                                    chunk = data.get("response", "")
                                    if chunk: yield chunk
                                    if data.get("done"): break
                    return # Success

            except Exception as e:
                error_str = str(e)
                # ── Special Handling for 429 Quota Limits ──
                if "429" in error_str:
                    match = re.search(r"retry in ([\d\.]+)s", error_str)
                    wait_time = float(match.group(1)) if match else 30.0
                    logger.warning(f"AI Engine: Quota exceeded. Pausing for {wait_time}s before tactical retry...")
                    yield f"\n[System: Gemini Quota Hit. Tactical Pause for {wait_time}s...]"
                    await asyncio.sleep(wait_time + 0.5)
                    continue

                # If it's a 503 or "high demand" and we have retries left, wait and try again
                if ("503" in error_str or "high demand" in error_str.lower()) and attempt < max_retries - 1:
                    logger.warning(f"AI Engine: Gemini busy (Attempt {attempt+1}/{max_retries}). Retrying in {retry_delay}s...")
                    await asyncio.sleep(retry_delay)
                    retry_delay *= 2 
                    continue
                
                # Final failure
                logger.error("AI Engine: Generation failed", error=error_str)
                provider_name = "Gemini Uplink" if (custom_key or self.provider != "ollama") else "Local Ollama"
                yield f"\n[{provider_name} Error: {error_str}]"
                return

# Singleton instance
ai_engine = AIEngine()
