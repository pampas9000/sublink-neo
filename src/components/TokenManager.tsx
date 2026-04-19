/** @jsxRuntime automatic */
/** @jsxImportSource hono/jsx */
import { FC } from 'hono/jsx';

interface TokenManagerProps {
    t: (key: string) => string;
}

export const TokenManager: FC<TokenManagerProps> = ({ t }) => {
    return (
        <>
            {/* Sync Status Indicator (Floating or in Header) */}
            <div 
                x-show="token" 
                class="fixed bottom-6 right-6 z-40"
                x-transition:enter="transition ease-out duration-300"
                x-transition:enter-start="opacity-0 translate-y-4"
                x-transition:enter-end="opacity-100 translate-y-0"
            >
                <div class="bg-white dark:bg-gray-800 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center gap-3">
                    <div class="flex items-center gap-2">
                        <div 
                            class="w-2 h-2 rounded-full"
                            x-bind:class="{
                                'bg-gray-400': syncStatus === 'idle',
                                'bg-blue-500 animate-pulse': syncStatus === 'syncing',
                                'bg-green-500': syncStatus === 'success',
                                'bg-red-500': syncStatus === 'error'
                            }"
                        ></div>
                        <span class="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider" x-text="token"></span>
                    </div>
                    <button 
                        type="button"
                        x-on:click="tokenPromptOpen = true"
                        class="text-gray-400 hover:text-primary-500 transition-colors"
                        title={t('tokenManager')}
                    >
                        <i class="fas fa-cog text-sm"></i>
                    </button>
                    
                    {/* Sync Success Tooltip */}
                    <div 
                        x-show="syncStatus === 'success'" 
                        class="absolute -top-10 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap"
                        x-transition:enter="transition ease-out duration-200"
                        x-transition:enter-start="opacity-0 -translate-y-1"
                        x-transition:enter-end="opacity-100 -translate-y-0"
                    >
                        {t('syncSuccess')}
                    </div>
                </div>
            </div>

            {/* Token Setup Modal */}
            <div 
                x-show="tokenPromptOpen" 
                class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm"
                x-transition:enter="transition ease-out duration-300"
                x-transition:enter-start="opacity-0"
                x-transition:enter-end="opacity-100"
                style="display: none;"
            >
                <div 
                    class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 w-full max-w-md overflow-hidden"
                    {...{ 'x-on:click.away': 'if(token) tokenPromptOpen = false' }}
                    x-transition:enter="transition ease-out duration-300"
                    x-transition:enter-start="opacity-0 scale-95"
                    x-transition:enter-end="opacity-100 scale-100"
                >
                    <div class="p-8">
                        <div class="w-16 h-16 bg-primary-50 dark:bg-primary-900/20 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                            <i class="fas fa-cloud-sync text-2xl text-primary-600"></i>
                        </div>
                        
                        <h3 class="text-2xl font-bold text-gray-900 dark:text-white text-center mb-2">
                            {t('tokenSetupTitle')}
                        </h3>
                        <p class="text-gray-500 dark:text-gray-400 text-center mb-8 text-sm leading-relaxed">
                            {t('tokenSetupDesc')}
                        </p>

                        <div class="space-y-6" x-data="{ localToken: '', error: '' }">
                            {/* Input Field */}
                            <div>
                                <label class="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 ml-1">
                                    {t('enterToken')}
                                </label>
                                <div class="relative">
                                    <input 
                                        type="text" 
                                        x-model="localToken"
                                        placeholder="e.g. a1b2c3d4"
                                        class="w-full h-12 bg-gray-50 dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 rounded-xl px-4 text-gray-900 dark:text-white focus:border-primary-500 focus:ring-0 transition-all text-center font-mono tracking-widest uppercase"
                                        {...{ 'x-on:keyup.enter': "if(localToken.trim()) { setToken(localToken.trim().toLowerCase()); tokenPromptOpen = false; }" }}
                                    />
                                </div>
                                <p x-show="error" x-text="error" class="text-red-500 text-xs mt-2 text-center"></p>
                            </div>

                            {/* Actions */}
                            <div class="flex flex-col gap-3">
                                <button 
                                    type="button"
                                    x-on:click="if(localToken.trim()) { setToken(localToken.trim().toLowerCase()); tokenPromptOpen = false; } else { error = t('invalidToken'); }"
                                    class="w-full h-12 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-xl shadow-lg shadow-primary-500/30 transition-all flex items-center justify-center gap-2"
                                >
                                    <span>{t('switchToken')}</span>
                                    <i class="fas fa-arrow-right text-sm"></i>
                                </button>
                                
                                <div class="relative py-2 flex items-center justify-center">
                                    <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-gray-100 dark:border-gray-800"></div></div>
                                    <span class="relative px-4 bg-white dark:bg-gray-900 text-[10px] font-bold text-gray-400 uppercase tracking-widest">OR</span>
                                </div>

                                <button 
                                    type="button"
                                    x-on:click="const t = generateToken(); setToken(t); tokenPromptOpen = false;"
                                    class="w-full h-12 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold rounded-xl transition-all border border-gray-200 dark:border-gray-700"
                                >
                                    {t('generateNewToken')}
                                </button>
                            </div>

                            {/* Current Token (if exists) */}
                            <template x-if="token && !tokenPromptOpen">
                                <div class="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 flex items-center justify-between">
                                    <div class="flex flex-col">
                                        <span class="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{t('currentToken')}</span>
                                        <span class="font-mono text-gray-900 dark:text-white" x-text="token"></span>
                                    </div>
                                    <button 
                                        type="button"
                                        x-on:click="navigator.clipboard.writeText(token); "
                                        class="p-2 text-gray-400 hover:text-primary-500 transition-colors"
                                    >
                                        <i class="fas fa-copy"></i>
                                    </button>
                                </div>
                            </template>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};
