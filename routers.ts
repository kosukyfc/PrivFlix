// Adicione este import no topo do seu routers.ts
import { getFlexPlaybackSources, FlexPlaybackResponse } from './services/flexExtractor';
import { z } from 'zod';

// Dentro do seu appRouter, adicione:

export const flexRouter = router({
  getPlayback: procedure
    .input(z.object({
      slug: z.string().min(1, "Slug é obrigatório").transform(s => s.toLowerCase().trim().replace(/ /g, '-'))
    }))
    .query(({ input }) => {
      // Executa a extração assíncrona
      return getFlexPlaybackSources(input.slug);
    }),
    
  // Endpoint opcional para testar a saúde do extractor
  health: procedure.query(() => {
    return { status: 'ok', module: 'FlexExtractor' };
  })
});

// No seu appRouter principal, inclua:
// export const appRouter = router({
//   flex: flexRouter,
//   // ... seus outros routers
// });