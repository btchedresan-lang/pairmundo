import { Redirect } from 'expo-router';
import { useAuth } from '../auth';

export default function Index() {
  const { me } = useAuth();
  return <Redirect href={me ? '/discover' : '/login'} />;
}
