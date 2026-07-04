import { orderRepo } from '../data/orderRepo';
export const listOrders = () => orderRepo.all();
