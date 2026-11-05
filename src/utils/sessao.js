import { supabase } from '../supabase';

// Sair da conta (topo do computador e menu "Mais" do celular). Se o servidor
// não responder, limpa a sessão só neste navegador mesmo assim.
export async function sairDaConta() {
    const { error } = await supabase.auth.signOut();
    if (error) await supabase.auth.signOut({ scope: 'local' });
    return !error;
}
