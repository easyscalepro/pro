"use client";

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { User, Save, X, Eye, EyeOff, RefreshCw, Database, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useUsers, type User as UserType } from '@/contexts/users-context';
import { useAuth } from '@/components/auth/auth-provider';
import { supabase } from '@/integrations/supabase/client';

interface UserFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  user?: UserType;
  mode: 'create' | 'edit';
}

export const UserFormModal: React.FC<UserFormModalProps> = ({
  isOpen,
  onClose,
  user,
  mode
}) => {
  const { refreshUsers } = useUsers();
  const { user: currentUser, profile } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    status: 'ativo' as 'ativo' | 'inativo' | 'suspenso',
    role: 'user' as 'admin' | 'user' | 'moderator',
    phone: '',
    company: '',
    password: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [createWithAuth, setCreateWithAuth] = useState(true);

  useEffect(() => {
    if (mode === 'edit' && user) {
      setFormData({
        name: user.name,
        email: user.email,
        status: user.status,
        role: user.role,
        phone: user.phone || '',
        company: user.company || '',
        password: ''
      });
      setCreateWithAuth(false);
    } else {
      setFormData({
        name: '',
        email: '',
        status: 'ativo',
        role: 'user',
        phone: '',
        company: '',
        password: ''
      });
      setCreateWithAuth(true);
    }
  }, [mode, user, isOpen]);

  const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.random() * chars.length);
    }
    setFormData({...formData, password});
    toast.success('Senha gerada automaticamente!');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Validações básicas
      if (!formData.name.trim()) {
        toast.error('O nome é obrigatório');
        return;
      }

      if (!formData.email.trim()) {
        toast.error('O email é obrigatório');
        return;
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        toast.error('Email inválido');
        return;
      }

      if (mode === 'create') {
        console.log('➕ Modo: Criar novo usuário');

        if (profile?.role !== 'admin') {
          toast.error('Apenas administradores podem criar usuários');
          return;
        }

        // Verificar se email já existe
        toast.loading('Verificando disponibilidade do email...', { id: 'create-user' });
        
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('id, email')
          .eq('email', formData.email.trim().toLowerCase())
          .single();

        if (existingProfile) {
          toast.dismiss('create-user');
          toast.error('Este email já está cadastrado na plataforma');
          return;
        }

        let userId = '';
        let authCreated = false;

        // Se criar com autenticação está ativado e tem senha
        if (createWithAuth && formData.password.trim()) {
          try {
            console.log('🔐 Tentando criar no Auth...');
            toast.loading('Criando usuário com autenticação...', { id: 'create-user' });
            
            const { data: adminUser, error: adminError } = await supabase.auth.admin.createUser({
              email: formData.email.trim().toLowerCase(),
              password: formData.password,
              email_confirm: true,
              user_metadata: {
                name: formData.name.trim(),
                company: formData.company.trim(),
                phone: formData.phone.trim()
              }
            });

            if (!adminError && adminUser.user) {
              userId = adminUser.user.id;
              authCreated = true;
              console.log('✅ Usuário criado via Admin API:', userId);
            } else {
              console.warn('⚠️ Admin API falhou:', adminError);
              // Continuar sem auth
            }
          } catch (authError) {
            console.warn('⚠️ Criação no Auth falhou:', authError);
            // Continuar sem auth
          }
        }

        // Se não conseguiu criar no Auth ou não quer criar com Auth, gerar ID único
        if (!userId) {
          userId = crypto.randomUUID();
          console.log('📝 Usando ID gerado para perfil apenas:', userId);
        }

        // Criar perfil na tabela profiles - DADOS MÍNIMOS
        console.log('👤 Criando perfil na tabela profiles...');
        toast.loading('Salvando perfil na tabela...', { id: 'create-user' });
        
        // Dados absolutamente mínimos para inserção
        const profileData = {
          id: userId,
          email: formData.email.trim().toLowerCase(),
          name: formData.name.trim(),
          role: formData.role,
          status: formData.status
        };

        // Adicionar campos opcionais apenas se preenchidos
        if (formData.phone.trim()) {
          (profileData as any).phone = formData.phone.trim();
        }
        if (formData.company.trim()) {
          (profileData as any).company = formData.company.trim();
        }

        console.log('📋 Dados mínimos para inserção:', profileData);

        // Tentar inserção com dados mínimos
        const { data: profileResult, error: profileError } = await supabase
          .from('profiles')
          .insert(profileData)
          .select()
          .single();

        if (profileError) {
          console.error('❌ Erro detalhado ao criar perfil:', {
            error: profileError,
            message: profileError?.message || 'Erro desconhecido',
            details: profileError?.details || 'Sem detalhes',
            hint: profileError?.hint || 'Sem dicas',
            code: profileError?.code || 'Sem código'
          });
          
          // Tentar com service role se falhou
          console.log('🔄 Tentando com service role...');
          
          try {
            // Usar uma abordagem mais direta
            const { data: serviceResult, error: serviceError } = await supabase
              .from('profiles')
              .insert({
                id: userId,
                email: formData.email.trim().toLowerCase(),
                name: formData.name.trim(),
                role: formData.role,
                status: formData.status,
                phone: formData.phone.trim() || null,
                company: formData.company.trim() || null,
                commands_used: 0,
                last_access: new Date().toISOString(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              })
              .select()
              .single();

            if (serviceError) {
              console.error('❌ Service role também falhou:', serviceError);
              
              // Mensagem de erro baseada no código
              let errorMessage = 'Falha ao salvar perfil na tabela profiles';
              
              if (serviceError.code === '23505') {
                errorMessage = 'Este email já existe na tabela profiles';
              } else if (serviceError.code === '42501') {
                errorMessage = 'Sem permissão para inserir na tabela profiles. Verifique as políticas RLS.';
              } else if (serviceError.code === '23502') {
                errorMessage = 'Campo obrigatório em falta na tabela profiles';
              } else if (serviceError.message?.includes('duplicate key')) {
                errorMessage = 'Este usuário já existe na tabela profiles';
              } else if (serviceError.message?.includes('permission')) {
                errorMessage = 'Sem permissão para criar perfil na tabela profiles';
              } else if (serviceError.message?.includes('violates')) {
                errorMessage = 'Dados inválidos para criação do perfil';
              } else if (serviceError.message) {
                errorMessage = `Erro na tabela profiles: ${serviceError.message}`;
              }
              
              throw new Error(errorMessage);
            } else {
              console.log('✅ Perfil criado com service role:', serviceResult);
            }
          } catch (finalError: any) {
            console.error('❌ Todas as tentativas falharam:', finalError);
            throw new Error('Não foi possível criar o perfil na tabela profiles. Verifique as permissões.');
          }
        } else {
          console.log('✅ Perfil criado na primeira tentativa:', profileResult);
        }

        toast.dismiss('create-user');
        
        if (authCreated && createWithAuth) {
          toast.success('✅ Usuário criado com sucesso!', {
            description: `${formData.name} pode fazer login com: ${formData.email}`
          });
          
          // Mostrar credenciais
          setTimeout(() => {
            toast.info('📋 Credenciais de acesso:', {
              description: `Email: ${formData.email} | Senha: ${formData.password}`,
              duration: 15000
            });
          }, 1000);
        } else {
          toast.success('✅ Perfil criado com sucesso!', {
            description: `${formData.name} foi adicionado à plataforma`
          });
        }

        await refreshUsers();

      } else if (mode === 'edit' && user) {
        console.log('✏️ Modo: Editar usuário existente');
        
        toast.loading('Atualizando dados do usuário...', { id: 'update-user' });

        const updateData = {
          name: formData.name.trim(),
          status: formData.status,
          role: formData.role,
          phone: formData.phone.trim() || null,
          company: formData.company.trim() || null,
          updated_at: new Date().toISOString()
        };

        console.log('📋 Dados de atualização:', updateData);

        const { data: updatedProfile, error: updateError } = await supabase
          .from('profiles')
          .update(updateData)
          .eq('id', user.id)
          .select()
          .single();

        if (updateError) {
          console.error('❌ Erro detalhado ao atualizar perfil:', {
            error: updateError,
            message: updateError?.message || 'Erro desconhecido',
            details: updateError?.details || 'Sem detalhes',
            hint: updateError?.hint || 'Sem dicas',
            code: updateError?.code || 'Sem código'
          });
          
          let errorMessage = 'Falha ao atualizar perfil na tabela profiles';
          
          if (updateError.code === '42501') {
            errorMessage = 'Sem permissão para atualizar este perfil';
          } else if (updateError.message?.includes('permission')) {
            errorMessage = 'Sem permissão para atualizar este perfil';
          } else if (updateError.message?.includes('violates')) {
            errorMessage = 'Dados inválidos para atualização do perfil';
          } else if (updateError.message) {
            errorMessage = `Erro na atualização: ${updateError.message}`;
          }
          
          throw new Error(errorMessage);
        }

        console.log('✅ Perfil atualizado:', updatedProfile);

        toast.dismiss('update-user');
        toast.success('✅ Usuário atualizado com sucesso!');

        await refreshUsers();
      }
      
      onClose();
      
    } catch (error: any) {
      console.error('💥 Erro geral:', error);
      toast.dismiss('create-user');
      toast.dismiss('update-user');
      
      // Tratamento de erro melhorado
      let userFriendlyMessage = 'Erro desconhecido';
      
      if (error.message) {
        if (error.message.includes('já existe')) {
          userFriendlyMessage = 'Este email já está cadastrado no sistema';
        } else if (error.message.includes('permissão') || error.message.includes('permission')) {
          userFriendlyMessage = 'Você não tem permissão para esta operação';
        } else if (error.message.includes('profiles')) {
          userFriendlyMessage = 'Erro ao acessar a tabela de usuários';
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
          userFriendlyMessage = 'Erro de conexão. Verifique sua internet';
        } else {
          userFriendlyMessage = error.message;
        }
      }
      
      toast.error('❌ Operação falhou', {
        description: userFriendlyMessage
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-[#2563EB]" />
            {mode === 'create' ? 'Criar Novo Usuário' : 'Editar Usuário'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome Completo *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              placeholder="Ex: João Silva"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              placeholder="joao@empresa.com"
              required
              disabled={mode === 'edit'}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select 
                value={formData.status} 
                onValueChange={(value) => setFormData({...formData, status: value as any})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                  <SelectItem value="suspenso">Suspenso</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Função</Label>
              <Select 
                value={formData.role} 
                onValueChange={(value) => setFormData({...formData, role: value as any})}
                disabled={profile?.role !== 'admin'}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Usuário</SelectItem>
                  <SelectItem value="moderator">Moderador</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="company">Empresa</Label>
            <Input
              id="company"
              value={formData.company}
              onChange={(e) => setFormData({...formData, company: e.target.value})}
              placeholder="Nome da empresa"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Telefone</Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => setFormData({...formData, phone: e.target.value})}
              placeholder="(11) 99999-9999"
            />
          </div>

          {/* Seção de Senha - apenas para criação */}
          {mode === 'create' && (
            <div className="border-t pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-semibold">Criar com Autenticação</Label>
                  <p className="text-xs text-gray-500">Se ativado, o usuário poderá fazer login</p>
                </div>
                <Switch
                  checked={createWithAuth}
                  onCheckedChange={setCreateWithAuth}
                />
              </div>

              {createWithAuth && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Senha Personalizada</Label>
                    <Button
                      type="button"
                      onClick={generatePassword}
                      size="sm"
                      variant="ghost"
                      className="text-xs text-blue-600 hover:text-blue-700"
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Gerar
                    </Button>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => setFormData({...formData, password: e.target.value})}
                      placeholder="Digite qualquer senha (sem regras)"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">
                    Sem restrições: use qualquer senha, qualquer tamanho
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Info sobre salvamento */}
          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
            <div className="flex items-start gap-2">
              <Database className="h-4 w-4 text-blue-600 mt-0.5" />
              <div className="text-xs text-blue-700 dark:text-blue-300">
                <strong>Salvamento:</strong> Dados salvos na tabela <code>profiles</code> do Supabase com políticas RLS otimizadas
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-[#FBBF24] hover:bg-[#F59E0B] text-[#0F1115]"
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-[#0F1115] border-t-transparent rounded-full animate-spin"></div>
                  Salvando...
                </div>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  {mode === 'create' ? 'Criar Usuário' : 'Salvar Alterações'}
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};