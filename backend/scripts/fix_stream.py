import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
from app.models.ai_provider import AIProvider
from app.models.api_endpoint import APIEndpoint
from app.services.ai_provider_service import AIProviderService
from app.database import engine

async def fix_data():
    async_session = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with async_session() as session:
        result = await session.execute(select(AIProvider))
        providers = result.scalars().all()
        svc = AIProviderService(session)
        
        count = 0
        for provider in providers:
            if provider.provider_type == 'openai' and provider.endpoint_id:
                ep_result = await session.execute(select(APIEndpoint).where(APIEndpoint.id == provider.endpoint_id))
                ep = ep_result.scalar_one_or_none()
                if ep:
                    health_config = svc.build_health_config(provider.provider_type, provider.base_url, provider.model)
                    ep.request_body_json = health_config['request_body_json']
                    print(f'Updated provider {provider.id} ({provider.name}) endpoint {ep.id}')
                    count += 1
                    
        await session.commit()
        print(f'Successfully updated {count} providers.')

if __name__ == '__main__':
    asyncio.run(fix_data())
