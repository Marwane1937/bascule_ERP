const User = require('../models/user.model');
const bcrypt = require('bcryptjs');

const passwordPolicyRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

exports.getAllUsers = async (sequelizeConnection = null) => {
  // Si une connexion est fournie, utiliser une requête SQL directe
  if (sequelizeConnection) {
    const users = await sequelizeConnection.query(`
      SELECT id, nom, login, type, etat
      FROM users
      ORDER BY nom ASC
    `, {
      type: sequelizeConnection.QueryTypes.SELECT
    });
    return Array.isArray(users) ? users : [users];
  }
  // Sinon, utiliser le modèle (connexion par défaut)
  return await User.findAll();
};

exports.createUser = async (data, sequelizeConnection = null) => {
  const password = data.password || data.pass;
  const hashedPassword = await bcrypt.hash(password, 10);

  // Si une connexion est fournie, utiliser une requête SQL directe
  if (sequelizeConnection) {
    const [result] = await sequelizeConnection.query(`
      INSERT INTO users (nom, login, pass, type, etat)
      OUTPUT INSERTED.*
      VALUES (:nom, :login, :pass, :type, :etat)
    `, {
      replacements: {
        nom: data.nom,
        login: data.login,
        pass: hashedPassword,
        type: data.type || 0,
        etat: data.etat !== undefined ? data.etat : 1
      },
      type: sequelizeConnection.QueryTypes.INSERT
    });
    return Array.isArray(result) ? result[0] : result;
  }
  // Sinon, utiliser le modèle (connexion par défaut)
  // Note: Si le modèle a des hooks, le hashage pourrait être fait là-bas, mais on le fait ici pour être sûr
  const userData = { ...data, pass: hashedPassword };
  return await User.create(userData);
};

exports.updateUser = async (id, data, sequelizeConnection = null) => {
  if (sequelizeConnection) {
    const updateFields = [];
    const replacements = { id };

    if (data.nom) {
      updateFields.push('nom = :nom');
      replacements.nom = data.nom;
    }
    if (data.login) {
      updateFields.push('login = :login');
      replacements.login = data.login;
    }
    if (data.type !== undefined) {
      updateFields.push('type = :type');
      replacements.type = data.type;
    }
    if (data.etat !== undefined) {
      updateFields.push('etat = :etat');
      replacements.etat = data.etat;
    }

    if (updateFields.length === 0) return null;

    await sequelizeConnection.query(`
      UPDATE users
      SET ${updateFields.join(', ')}
      WHERE id = :id
    `, {
      replacements,
      type: sequelizeConnection.QueryTypes.UPDATE
    });

    return { id, ...data };
  }

  const user = await User.findByPk(id);
  if (!user) throw new Error('Utilisateur non trouvé');
  return await user.update(data);
};

exports.deleteUser = async (id, sequelizeConnection = null) => {
  if (sequelizeConnection) {
    await sequelizeConnection.query(`
      DELETE FROM users WHERE id = :id
    `, {
      replacements: { id },
      type: sequelizeConnection.QueryTypes.DELETE
    });
    return { success: true };
  }

  const user = await User.findByPk(id);
  if (!user) throw new Error('Utilisateur non trouvé');
  return await user.destroy();
};

exports.toggleUserStatus = async (id, sequelizeConnection = null) => {
  if (sequelizeConnection) {
    // Récupérer l'état actuel
    const [users] = await sequelizeConnection.query(`
      SELECT etat FROM users WHERE id = :id
    `, {
      replacements: { id },
      type: sequelizeConnection.QueryTypes.SELECT
    });

    if (!users) throw new Error('Utilisateur non trouvé');

    const newEtat = users.etat === 1 ? 0 : 1;

    await sequelizeConnection.query(`
      UPDATE users SET etat = :etat WHERE id = :id
    `, {
      replacements: { id, etat: newEtat },
      type: sequelizeConnection.QueryTypes.UPDATE
    });

    return { id, etat: newEtat };
  }

  const user = await User.findByPk(id);
  if (!user) throw new Error('Utilisateur non trouvé');
  user.etat = user.etat === 1 ? 0 : 1;
  return await user.save();
};

exports.resetPassword = async (id, password, sequelizeConnection = null) => {
  const hashedPassword = await bcrypt.hash(password, 10);

  if (sequelizeConnection) {
    await sequelizeConnection.query(`
      UPDATE users SET pass = :password WHERE id = :id
    `, {
      replacements: { id, password: hashedPassword },
      type: sequelizeConnection.QueryTypes.UPDATE
    });
    return { success: true };
  }

  const user = await User.findByPk(id);
  if (!user) throw new Error('Utilisateur non trouvé');
  user.pass = hashedPassword;
  return await user.save();
};

exports.changePassword = async (userId, currentPassword, newPassword, sequelizeConnection = null) => {
  if (!userId) throw new Error('Utilisateur invalide');
  if (!currentPassword || !newPassword) throw new Error('Mot de passe actuel et nouveau mot de passe requis');
  if (!passwordPolicyRegex.test(newPassword)) {
    throw new Error('Le nouveau mot de passe ne respecte pas les normes de securite');
  }

  const connection = sequelizeConnection;

  if (connection) {
    const user = await connection.query(`
      SELECT id, pass
      FROM users
      WHERE id = :id
    `, {
      replacements: { id: userId },
      type: connection.QueryTypes.SELECT
    });

    const currentUser = Array.isArray(user) ? user[0] : user;
    if (!currentUser) throw new Error('Utilisateur non trouve');
    if (!currentUser.pass) throw new Error('Mot de passe introuvable');

    const isValid = await bcrypt.compare(currentPassword, currentUser.pass);
    if (!isValid) throw new Error('Mot de passe actuel incorrect');
    const isSamePassword = await bcrypt.compare(newPassword, currentUser.pass);
    if (isSamePassword) throw new Error('Ce mot de passe existe deja');

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await connection.query(`
      UPDATE users
      SET pass = :password
      WHERE id = :id
    `, {
      replacements: { id: userId, password: hashedPassword },
      type: connection.QueryTypes.UPDATE
    });

    return { success: true };
  }

  const user = await User.findByPk(userId);
  if (!user) throw new Error('Utilisateur non trouve');
  if (!user.pass) throw new Error('Mot de passe introuvable');

  const isValid = await bcrypt.compare(currentPassword, user.pass);
  if (!isValid) throw new Error('Mot de passe actuel incorrect');
  const isSamePassword = await bcrypt.compare(newPassword, user.pass);
  if (isSamePassword) throw new Error('Ce mot de passe existe deja');

  user.pass = await bcrypt.hash(newPassword, 10);
  await user.save();
  return { success: true };
};
