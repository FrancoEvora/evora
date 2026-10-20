import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import './styles.css';
class Boundary extends React.Component<{children:React.ReactNode},{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return{failed:true}}render(){return this.state.failed?<main className="fatal"><h1>Vamos retomar de onde paramos.</h1><p>Não foi possível abrir esta tela. Seus dados salvos continuam disponíveis.</p><button onClick={()=>location.reload()}>Recarregar Aurora</button></main>:this.props.children}}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Boundary><App/></Boundary></React.StrictMode>);
