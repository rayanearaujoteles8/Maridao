import {Router,type Request} from 'express';
import {route,user} from './team-routes.ts';
import {createAdmin,createCustomer,createProvider,deactivateUser,decideProvider,deleteCustomer,editUser,listUsers,pendingProviderDetail,pendingProviders,requireAdmin,userDetail} from './admin.ts';
// RF14: toda rota exige sessão de administrador. A trava de senha provisória fica em session-guard.ts.
export const adminRoutes=Router();
const admin=async(req:Request)=>requireAdmin(await user(req));
const id=(req:Request)=>req.params.id as string;
adminRoutes.get('/users',route(async(req,res,db)=>{await admin(req);res.json(await listUsers(db,req.query));}));
adminRoutes.get('/users/:id',route(async(req,res,db)=>{await admin(req);res.json(await userDetail(db,id(req)));}));
adminRoutes.patch('/users/:id',route(async(req,res,db)=>{await editUser(db,await admin(req),id(req),req.body);res.json({message:'Cadastro atualizado.'});}));
adminRoutes.post('/users/:id/deactivate',route(async(req,res,db)=>{await deactivateUser(db,await admin(req),id(req),req.body);res.json({message:'Conta inativada. O histórico dos serviços foi preservado.'});}));
adminRoutes.post('/users/:id/delete',route(async(req,res,db)=>{await deleteCustomer(db,await admin(req),id(req),req.body);res.json({message:'Conta excluída. Os dados pessoais foram eliminados.'});}));
adminRoutes.post('/customers',route(async(req,res,db)=>{res.status(201).json({message:'Cadastro criado com sucesso.',customer:await createCustomer(db,await admin(req),req.body)});}));
adminRoutes.post('/providers',route(async(req,res,db)=>{res.status(201).json({message:'Cadastro criado com sucesso.',provider:await createProvider(db,await admin(req),req.body)});}));
adminRoutes.get('/providers/pending',route(async(req,res,db)=>{await admin(req);res.json(await pendingProviders(db,req.query));}));
adminRoutes.get('/providers/pending/:id',route(async(req,res,db)=>{await admin(req);res.json(await pendingProviderDetail(db,id(req)));}));
adminRoutes.post('/providers/:id/approve',route(async(req,res,db)=>{res.json({message:'Cadastro aprovado. O prestador foi notificado.',provider:await decideProvider(db,await admin(req),id(req),req.body,true)});}));
adminRoutes.post('/providers/:id/reject',route(async(req,res,db)=>{res.json({message:'Cadastro rejeitado. O prestador foi notificado.',provider:await decideProvider(db,await admin(req),id(req),req.body,false)});}));
adminRoutes.post('/admins',route(async(req,res,db)=>{res.status(201).json({message:'Administrador cadastrado com sucesso.',admin:await createAdmin(db,await admin(req),req.body)});}));
